# LootRadar Private Accounts and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give optional private accounts a useful Google-first sign-in flow, a cross-device watchlist and preference sync, a private dashboard, and safe self-service deletion.

**Architecture:** Extract profile/watchlist normalization and deterministic merge rules into a dependency-free universal module. A single browser account client owns Supabase session state and background synchronization; the homepage, recommendations page, login page, and new account dashboard consume that client while preserving local-first behavior during outages.

**Tech Stack:** Static HTML/CSS, browser JavaScript, Supabase Auth/Postgres/Edge Functions, Node.js 20+, Node's built-in test runner

## Global Constraints

- Browsing, searching, opening deals, watchlists, and recommendations remain usable without an account.
- Google is the primary sign-in method; passwordless email magic link remains visible as fallback.
- Accounts are private: no usernames, avatars, public profiles, followers, comments, or public activity.
- Guest data must not be deleted before a successful synchronized write.
- All account tables use Row Level Security and owner-scoped policies.
- Service-role credentials remain server-side and never enter repository or browser code.
- GoatCounter events contain no email, user ID, game ID, target price, watchlist content, or private preference value.

---

### Task 1: Define versioned local data and merge behavior

**Files:**
- Create: `lib/account-data.js`
- Create: `tests/account-data.test.js`

**Interfaces:**
- Produces: `normalizeProfile(value, now) -> Profile`.
- Produces: `normalizeWatchlist(value, now) -> Record<string, WatchItem>`.
- Produces: `mergeProfiles(local, remote) -> Profile`.
- Produces: `mergeWatchlists(local, remoteRows) -> Record<string, WatchItem>`.
- Produces: `applyFeedbackRows(profile, rows) -> Profile`.
- `Profile` includes `schemaVersion`, `updatedAt`, existing filter fields, `likes`, and `dislikes`.
- `WatchItem` includes `key`, `title`, `targetPrice`, `addedAt`, and `updatedAt`.

- [ ] **Step 1: Write failing merge tests**

Create `tests/account-data.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProfile, normalizeWatchlist, mergeProfiles, mergeWatchlists
} = require('../lib/account-data.js');

test('normalizes legacy local records without discarding fields', () => {
  const profile = normalizeProfile({ budget: 20, genres: ['RPG'] }, '2026-07-27T12:00:00.000Z');
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.budget, 20);
  assert.deepEqual(profile.genres, ['RPG']);
  assert.equal(profile.updatedAt, '2026-07-27T12:00:00.000Z');
});

test('newer profile values win while feedback maps are unioned', () => {
  const local = { schemaVersion: 1, budget: 15, updatedAt: '2026-07-27T12:00:00Z', likes: { a: '2026-07-27T12:00:00Z' }, dislikes: {} };
  const remote = { schemaVersion: 1, budget: 30, updatedAt: '2026-07-27T11:00:00Z', likes: {}, dislikes: { b: '2026-07-27T11:00:00Z' } };
  const merged = mergeProfiles(local, remote);
  assert.equal(merged.budget, 15);
  assert.deepEqual(Object.keys(merged.likes), ['a']);
  assert.deepEqual(Object.keys(merged.dislikes), ['b']);
});

test('most recent direct feedback action wins', () => {
  const merged = mergeProfiles(
    { updatedAt: '2026-07-27T12:00:00Z', likes: { a: '2026-07-27T12:00:00Z' }, dislikes: {} },
    { updatedAt: '2026-07-27T11:00:00Z', likes: {}, dislikes: { a: '2026-07-27T13:00:00Z' } }
  );
  assert.equal(merged.likes.a, undefined);
  assert.equal(merged.dislikes.a, '2026-07-27T13:00:00Z');
});

test('watchlists union games and keep the most recently edited target', () => {
  const local = { portal: { key: 'portal', title: 'Portal', targetPrice: 3, updatedAt: '2026-07-27T13:00:00Z' } };
  const remote = [
    { game_key: 'portal', title: 'Portal', target_price: 5, updated_at: '2026-07-27T12:00:00Z' },
    { game_key: 'hades', title: 'Hades', target_price: 10, updated_at: '2026-07-27T12:00:00Z' }
  ];
  const merged = mergeWatchlists(local, remote);
  assert.equal(merged.portal.targetPrice, 3);
  assert.equal(merged.hades.targetPrice, 10);
});
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `node --test tests/account-data.test.js`

Expected: FAIL because `lib/account-data.js` does not exist.

- [ ] **Step 3: Implement the universal data module**

Create `lib/account-data.js` as a UMD module. Use ISO timestamps, reject non-finite/negative target prices, clone arrays/maps, and implement these conflict rules exactly:

```js
const localWins = Date.parse(local.updatedAt || 0) >= Date.parse(remote.updatedAt || 0);
const merged = Object.assign({}, localWins ? remote : local, localWins ? local : remote);
merged.schemaVersion = 1;
merged.likes = mergeActions(local.likes, remote.likes);
merged.dislikes = mergeActions(local.dislikes, remote.dislikes);
resolveDirectConflicts(merged.likes, merged.dislikes);
```

`mergeActions()` must keep the newest ISO timestamp for each key. `mergeWatchlists()` must convert remote snake-case rows into local camel-case objects, union by `game_key`, and retain the newer `updatedAt`.
When a legacy `likes`/`dislikes` value is boolean `true`, normalize it to the
profile's `updatedAt` so existing feedback remains usable.

- [ ] **Step 4: Run the merge tests**

Run: `node --test tests/account-data.test.js`

Expected: 4 tests pass and 0 fail.

- [ ] **Step 5: Commit the data contract**

```bash
git add lib/account-data.js tests/account-data.test.js
git commit -m "feat: define account data merge rules"
```

### Task 2: Add account tables and owner-only RLS

**Files:**
- Modify: `db/supabase-recommendations.sql`
- Create: `tests/account-schema.test.js`
- Create: `scripts/verify-account-rls.js`

**Interfaces:**
- Produces: `lr_profiles.schema_version`.
- Produces: `lr_watchlist` keyed by `(user_id, game_key)`.
- Produces: `lr_notification_preferences` keyed by `user_id`, with every notification disabled by default.

- [ ] **Step 1: Write a failing SQL contract test**

Create `tests/account-schema.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'supabase-recommendations.sql'), 'utf8');

test('account schema contains private synchronized records', () => {
  for (const token of [
    'schema_version integer not null default 1',
    'create table if not exists public.lr_watchlist',
    'primary key (user_id, game_key)',
    'create table if not exists public.lr_notification_preferences',
    'target_price_enabled boolean not null default false',
    'free_game_enabled boolean not null default false',
    'weekly_digest_enabled boolean not null default false'
  ]) assert.match(sql, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});

test('every exposed account table enables RLS and checks auth.uid', () => {
  for (const table of ['lr_profiles', 'lr_feedback', 'lr_watchlist', 'lr_notification_preferences']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`create policy "${table} owner"[\\s\\S]+auth\\.uid\\(\\) = user_id`, 'i'));
  }
});
```

- [ ] **Step 2: Run the SQL contract and verify failure**

Run: `node --test tests/account-schema.test.js`

Expected: FAIL because the watchlist and preference tables are absent.

- [ ] **Step 3: Extend the migration**

Add:

```sql
alter table public.lr_profiles
  add column if not exists schema_version integer not null default 1;

create table if not exists public.lr_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null,
  title text not null,
  target_price numeric(10,2) not null check (target_price >= 0),
  last_known_price numeric(10,2) check (last_known_price >= 0),
  last_known_store text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_key)
);

create table if not exists public.lr_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_price_enabled boolean not null default false,
  free_game_enabled boolean not null default false,
  weekly_digest_enabled boolean not null default false,
  timezone text not null default 'America/New_York',
  digest_day smallint not null default 5 check (digest_day between 0 and 6),
  digest_hour smallint not null default 10 check (digest_hour between 0 and 23),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);
```

Enable RLS and add `for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)` policies named `"lr_watchlist owner"` and `"lr_notification_preferences owner"`. Update existing policies to use the same `to authenticated` form.

- [ ] **Step 4: Run the SQL tests**

Run: `node --test tests/account-schema.test.js`

Expected: 2 tests pass and 0 fail.

- [ ] **Step 5: Add a live cross-user RLS verifier**

Create `scripts/verify-account-rls.js`. Read `LR_SUPABASE_URL`,
`LR_SUPABASE_ANON_KEY`, `LR_RLS_USER_A_JWT`, and `LR_RLS_USER_B_JWT` from the
environment and fail if any is absent. Through the REST API:

```js
const headers = token => ({
  apikey: process.env.LR_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});
```

Have user A upsert `lr_profiles` with `data: { rlsProbe: "owner-a" }`. Verify A
can read it, B receives an empty array when selecting that row, and B cannot
update or delete it. Repeat the same owner/cross-user checks for `lr_feedback`,
`lr_watchlist`, and `lr_notification_preferences`. Delete the probe records as
user A in a `finally` block.

- [ ] **Step 6: Apply the migration and exercise RLS**

Run the complete idempotent `db/supabase-recommendations.sql` in the production Supabase SQL editor.

Then sign in two disposable accounts, copy their short-lived access tokens into
the two exact environment variables, and run:

```bash
node scripts/verify-account-rls.js
```

Expected: `Verified owner access and cross-user isolation for 4 account tables.`
All four tables show RLS enabled and existing profile/feedback data remains
intact.

- [ ] **Step 7: Commit the schema**

```bash
git add db/supabase-recommendations.sql tests/account-schema.test.js scripts/verify-account-rls.js
git commit -m "feat: add private account sync tables"
```

### Task 3: Centralize Supabase session and synchronization

**Files:**
- Create: `lib/account-client.js`
- Create: `tests/account-client.test.js`
- Modify: `lib/analytics.js`
- Modify: `tests/analytics.test.js`
- Modify: `scripts/build-static.js`

**Interfaces:**
- Consumes: `window.LootRadarAccountData`.
- Produces: `createAccountClient({ client, storage, now })`.
- Client methods: `session()`, `subscribe(listener)`, `syncProfile(profile)`, `syncFeedback(profile)`, `syncWatchlist(watchlist)`, `loadAndMerge(localProfile, localWatchlist)`, `signOut()`.
- Emits `{ status: 'guest'|'syncing'|'synced'|'delayed', user, profile, watchlist }`.

- [ ] **Step 1: Write failing client tests with a fake Supabase adapter**

Test that `loadAndMerge()` reads `lr_profiles`, `lr_feedback`, and `lr_watchlist`,
merges feedback rows into the local profile, writes only after successful reads,
leaves local storage intact on failed upsert, and reports `delayed` rather than
throwing. Test that `syncWatchlist()` upserts current rows and deletes remote keys
no longer present.

Use an injected fake with the same chain methods as `client.from(table)`; do not contact production Supabase from unit tests.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/account-client.test.js`

Expected: FAIL because `lib/account-client.js` does not exist.

- [ ] **Step 3: Implement the account client**

Create a UMD module that:

```js
async function loadAndMerge(localProfile, localWatchlist) {
  setStatus('syncing');
  const [
    { data: profileRow, error: profileError },
    { data: feedbackRows, error: feedbackError },
    { data: watchRows, error: watchError }
  ] =
    await Promise.all([
      client.from('lr_profiles').select('data,updated_at,schema_version').maybeSingle(),
      client.from('lr_feedback').select('item_id,action,updated_at'),
      client.from('lr_watchlist').select('*')
    ]);
  if (profileError || feedbackError || watchError) return delay();

  const remoteProfile = data.applyFeedbackRows(profileRow?.data || {}, feedbackRows || []);
  const profile = data.mergeProfiles(localProfile, remoteProfile);
  const watchlist = data.mergeWatchlists(localWatchlist, watchRows || []);
  const written = await Promise.all([
    syncProfile(profile), syncFeedback(profile), syncWatchlist(watchlist)
  ]);
  if (written.some(value => value === false)) return delay({ profile, watchlist });
  setStatus('synced', { profile, watchlist });
  return { profile, watchlist, synced: true };
}
```

Use `user_id` from `client.auth.getSession()`, never a caller-supplied ID. Save local state only after the returned merged objects are available. Debounce subsequent background writes by 400 ms.
Track only `account_sync` with `result: success|failure`; add `result` to the
analytics property allow-list and never include record contents.

- [ ] **Step 4: Run client and merge tests**

Run:

```bash
node --test tests/account-data.test.js tests/account-client.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Ensure the build includes the new modules**

`lib` is already copied recursively. Add `lib/account-data.js` and `lib/account-client.js` to the required source/build lists in `scripts/verify-site.js`.

- [ ] **Step 6: Commit the client**

```bash
git add lib/account-client.js tests/account-client.test.js scripts/verify-site.js
git commit -m "feat: add local-first Supabase account client"
```

### Task 4: Replace the auth page with Google-first access

**Files:**
- Modify: `login.html`
- Create: `login.js`
- Modify: `lib/analytics.js`
- Modify: `tests/analytics.test.js`
- Modify: `tests/safe-redirect.test.js`

**Interfaces:**
- Consumes: `LootRadarRedirect.safeRedirect()`.
- Produces: Google OAuth using `supabase.auth.signInWithOAuth({ provider: 'google' })`.
- Preserves: `supabase.auth.signInWithOtp()` fallback.

- [ ] **Step 1: Extend analytics tests**

Assert `auth_request` accepts only `provider: google|email` through a new allow-listed `provider` property and continues rejecting email addresses and user IDs.

- [ ] **Step 2: Extract and implement the auth controller**

Move inline auth code to `login.js`. Bind `#googleLogin` and `#sendLogin`:

```js
googleButton.addEventListener('click', async () => {
  analytics.track('auth_request', { surface: 'login', provider: 'google', signedIn: false });
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}/login.html?next=${encodeURIComponent(next)}` }
  });
  if (error) show('Google sign-in is unavailable. Use the email option below.');
});
```

Keep the current `signInWithOtp()` call, but record `provider: 'email'`. On an existing session redirect to the safe `next` path. Default `next` to `/account.html`.

- [ ] **Step 3: Rebuild the login card**

Use `Continue with Google` as the primary full-width button, an `or` divider, and the existing email input/button below it. Update the benefits to “sync watchlist and target prices,” “keep recommendation choices,” and “manage private alert settings.” State that authentication never opts users into deal email.

- [ ] **Step 4: Add identity-linking entry from the account page contract**

Reserve `#linkGoogle` for signed-in email users. Its controller calls:

```js
await supabase.auth.linkIdentity({
  provider: 'google',
  options: { redirectTo: `${location.origin}/account.html?linked=google` }
});
```

Hide it when `getUserIdentities()` already contains `provider === 'google'`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/analytics.test.js tests/safe-redirect.test.js
```

Expected: all tests pass and unsafe cross-origin `next` values still resolve to `/account.html`.

- [ ] **Step 6: Commit auth UI**

```bash
git add login.html login.js lib/analytics.js tests/analytics.test.js tests/safe-redirect.test.js
git commit -m "feat: add Google-first account access"
```

### Task 5: Synchronize homepage watchlists and recommendations

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `recommendations.html`
- Modify: `recommendations.js`
- Modify: `style.css`
- Modify: `recommendations.css`
- Create: `tests/account-wiring.test.js`

**Interfaces:**
- Consumes: `LootRadarAccountClient`.
- Homepage persists `lr_watchlist_v1`.
- Recommendations persist `lr_rec_profile_v3`.
- Signed-in writes update local storage immediately and sync in the background.

- [ ] **Step 1: Add failing wiring tests**

Assert both pages load Supabase, `supabase-config.js`, `account-data.js`, and `account-client.js` before their page script. Assert `app.js` calls `syncWatchlist()` and `recommendations.js` calls `syncProfile()`. Assert both contain the visible string `Sync delayed`.

- [ ] **Step 2: Initialize one account client per page**

After local state is created:

```js
const client = window.supabase && window.LR_SUPABASE_URL && window.LR_SUPABASE_ANON_KEY
  ? window.supabase.createClient(window.LR_SUPABASE_URL, window.LR_SUPABASE_ANON_KEY)
  : null;
const account = client && window.LootRadarAccountClient.createAccountClient({
  client,
  storage: window.localStorage
});
```

Call `loadAndMerge()` once after session detection. Replace in-memory state with its returned `profile`/`watchlist`, write the merged local cache, and rerender.

- [ ] **Step 3: Sync each local mutation**

In `saveWatchlist()` and `saveProfile()`, write local storage first, update the page immediately, then call the debounced account method. Never await the network before rendering.

Add a compact status element whose text is `Saved on this device`, `Syncing…`, `Synced`, or `Sync delayed`. Link signed-in users to `account.html`; link guests to `login.html?next=<current path>`.

- [ ] **Step 4: Preserve guest behavior during failures**

Catch session, read, upsert, and delete failures inside the account client. The page must still allow adding/removing games, editing target prices, liking/dismissing recommendations, and changing filters.

- [ ] **Step 5: Run account wiring and data tests**

Run:

```bash
node --test tests/account-data.test.js tests/account-client.test.js tests/account-wiring.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit cross-device sync**

```bash
git add index.html app.js recommendations.html recommendations.js style.css recommendations.css tests/account-wiring.test.js
git commit -m "feat: sync watchlists and preferences across devices"
```

### Task 6: Add the private dashboard and deletion service

**Files:**
- Create: `account.html`
- Create: `account.js`
- Create: `supabase/functions/delete-account/index.ts`
- Create: `supabase/functions/delete-account/deno.json`
- Create: `tests/account-page.test.js`
- Modify: `lib/analytics.js`
- Modify: `tests/analytics.test.js`
- Modify: `scripts/build-static.js`
- Modify: `scripts/verify-site.js`

**Interfaces:**
- Dashboard consumes the account client and current Supabase session.
- `delete-account` accepts `POST` with a valid user JWT and `{ confirm: "DELETE" }`.
- The function rejects sessions older than 10 minutes using the JWT `iat` claim.

- [ ] **Step 1: Write the dashboard contract test**

Require `account.html` to be `noindex,follow` and contain watchlist, preferences, notification settings, alert history, Google linking, sign out, and deletion sections. Require `account.js` to escape dynamic text via `textContent`, never `innerHTML`.
Extend analytics tests to allow `account_delete_request` with no private
properties.

- [ ] **Step 2: Build the private dashboard**

On load, redirect guests to `login.html?next=/account.html`. Render the authenticated email, identity providers, watchlist/targets, recommendation preferences, and three disabled-by-default email toggles from `lr_notification_preferences`. Until the notification release is configured, label toggles `Email delivery setup pending` and keep them disabled.

Use DOM node creation and `textContent` for titles/stores. Include `#linkGoogle`, `#signOut`, and a danger-zone dialog requiring the exact text `DELETE`.

- [ ] **Step 3: Add recent-auth deletion flow**

When deletion starts, decode the JWT payload from `session.access_token` and
inspect `iat`. If the session is older than 10 minutes, send the user through
Google OAuth or email magic-link login with `next=/account.html?delete=1`. Only
then invoke:

```js
await supabase.functions.invoke('delete-account', {
  body: { confirm: 'DELETE' }
});
```

On success clear `lr_watchlist_v1`, `lr_rec_profile_v3`, and Supabase auth storage, then redirect to `/?account=deleted`. On failure leave the session/local data intact and show an accurate error.
Record `account_delete_request` immediately before invoking the function, with
no email, user ID, or deletion reason.

- [ ] **Step 4: Implement the server-side deletion function**

Use the caller's Authorization header to call `auth.getUser()`, decode and validate `iat`, require `{ confirm: "DELETE" }`, then call the admin client:

```ts
const { error } = await admin.auth.admin.deleteUser(user.id, false);
if (error) return Response.json({ error: 'Deletion failed' }, { status: 500 });
return Response.json({ deleted: true });
```

Create the admin client only from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment secrets. Return 401 for missing/invalid user auth, 403 for old auth, and 400 for missing confirmation.

- [ ] **Step 5: Add page/build verification**

Add `account.html` and `account.js` to `scripts/build-static.js`, require them in `scripts/verify-site.js`, and confirm `account.html` is excluded from the sitemap.

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/account-page.test.js
npm test
npm run build
npm run verify
```

Expected: every command exits 0.

- [ ] **Step 7: Deploy the function and commit**

Run:

```bash
supabase functions deploy delete-account
git add account.html account.js supabase/functions/delete-account scripts/build-static.js scripts/verify-site.js tests/account-page.test.js
git commit -m "feat: add private account dashboard and deletion"
```

Expected: an authenticated test account can delete itself; a stale session is rejected.

### Task 7: Update navigation, legal copy, configuration, and production checks

**Files:**
- Modify: all public HTML navigation/footer blocks
- Modify: `about.html`
- Modify: `privacy.html`
- Modify: `terms.html`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `.github/workflows/sync-supabase-config.yml`
- Modify: `scripts/templates/deal-landing.js`

**Interfaces:**
- Guests see `Sign in`; authenticated pages switch the utility link to `My account`.
- Google OAuth callback returns only to `https://thelootradar.com/login.html`.

- [ ] **Step 1: Add one shared auth-navigation helper**

Create `lib/auth-nav.js` to read `supabase.auth.getSession()` with a 2-second timeout and update `[data-account-link]` from `Sign in`/`login.html` to `My account`/`account.html`. On any error retain the guest link.

- [ ] **Step 2: Wire navigation across public pages and templates**

Add `<a data-account-link href="login.html">Sign in</a>` at root and the `../` equivalent on nested pages. Load Supabase config, Supabase JS, and `lib/auth-nav.js` on pages that expose this dynamic link. Regenerate deal landing pages.

- [ ] **Step 3: Update privacy, terms, and product copy**

Document Google OAuth, passwordless email, Supabase-stored profile/watchlist/feedback, local cache behavior, default-off alert preferences, identity linking, service providers, and deletion. State clearly that accounts remain optional and private.

- [ ] **Step 4: Document exact external configuration**

Update README with:

- Supabase Google provider enabled with the production Google client ID/secret.
- Site URL `https://thelootradar.com`.
- Redirect allowlist `https://thelootradar.com/login.html`.
- Manual identity linking enabled.
- `db/supabase-recommendations.sql` applied.
- `delete-account` function deployed.

Keep `.env.example` limited to public browser keys; do not add service-role values. Continue generating `supabase-config.js` from repository secrets.

- [ ] **Step 5: Run and publish**

Run:

```bash
npm test
npm run build
npm run verify
git diff --check
git pull --rebase origin main
git push origin main
```

Expected: the live site offers Google and email sign-in, guest features still work while signed out, an authenticated test account syncs across two browser profiles, and no private key appears in source or built files.
