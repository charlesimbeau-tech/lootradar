# LootRadar Deal Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit-opt-in target-price alerts, current free-game alerts, and a weekly five-deal digest without sending stale or duplicate email.

**Architecture:** Publish a small quality-qualified alert snapshot from the existing scoring pipeline, then evaluate it in a scheduled Supabase Edge Function. Postgres owns preferences, processed snapshots, and idempotent delivery records; Resend is isolated behind an email adapter, while a separate signed-token endpoint handles category and all-email unsubscribe requests.

**Tech Stack:** Node.js 20+, Deno 2+, Supabase Postgres/Edge Functions/Cron/Vault, Resend HTTPS API, GitHub Actions, Node and Deno test runners

## Global Constraints

- All three email categories default to disabled and require explicit user consent.
- Authentication email never subscribes a user to deal email.
- Alert evaluation refuses stale, malformed, incomplete, or already-processed snapshots.
- Free-game messaging states that coverage is limited to LootRadar's current CheapShark-derived snapshot.
- Retailer pages remain authoritative for final price and availability.
- Delivery keys are idempotent in Postgres and are also sent as Resend `Idempotency-Key` values.
- Resend and Supabase service credentials remain server-side.
- Failed refreshes produce no “new deal” email.

---

### Task 1: Publish an alert-ready quality snapshot

**Files:**
- Create: `lib/alert-snapshot.js`
- Create: `scripts/build-alert-snapshot.js`
- Create: `tests/alert-snapshot.test.js`
- Create: `alert-deals.json`
- Modify: `.github/workflows/update-deals.yml`
- Modify: `scripts/build-static.js`
- Modify: `scripts/verify-site.js`

**Interfaces:**
- Consumes: `deals.json`, `enriched-deals.json`, `LootRadarDataset.buildDealDataset()`, and editorial config.
- Produces: `buildAlertSnapshot(base, enriched, options) -> { snapshotId, updatedAt, source, qualifiedDealCount, deals }`.
- Each deal contains `gameKey`, `title`, `salePrice`, `normalPrice`, `storeName`, `dealId`, `dealScore`, `recommendation`, and `free`.

- [ ] **Step 1: Write failing snapshot tests**

Test that ineligible deals are excluded, duplicate game keys keep the lowest qualified price, zero-price games set `free: true`, snapshot IDs equal the source `updatedAt`, and output ordering is deterministic by Deal Score then title.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/alert-snapshot.test.js`

Expected: FAIL because `lib/alert-snapshot.js` does not exist.

- [ ] **Step 3: Implement the snapshot builder**

Create a UMD/CommonJS module whose core mapping is:

```js
function buildAlertSnapshot(base, enriched, { buildDataset, config }) {
  const ranked = buildDataset(base, enriched, config)
    .filter(deal => deal.eligible);
  const byGame = new Map();
  for (const deal of ranked) {
    const item = {
      gameKey: deal.key,
      title: deal.title,
      salePrice: Number(deal.salePrice),
      normalPrice: Number(deal.normalPrice),
      storeName: deal.storeName,
      dealId: deal.dealID,
      dealScore: Number(deal.dealScore),
      recommendation: deal.recommendation,
      free: Number(deal.salePrice) === 0
    };
    const current = byGame.get(item.gameKey);
    if (!current || item.salePrice < current.salePrice) byGame.set(item.gameKey, item);
  }
  const deals = [...byGame.values()]
    .sort((a, b) => b.dealScore - a.dealScore || a.title.localeCompare(b.title));
  return {
    snapshotId: enriched.updatedAt,
    updatedAt: enriched.updatedAt,
    source: 'CheapShark-derived LootRadar quality snapshot',
    qualifiedDealCount: deals.length,
    deals
  };
}
```

Reject mismatched/invalid source timestamps, fewer than 20 qualified deals,
duplicate keys, non-finite prices/scores, and unsafe deal IDs before writing.

- [ ] **Step 4: Add the build script and workflow step**

`scripts/build-alert-snapshot.js` reads `deals.json` and
`enriched-deals.json`, calls the builder, and atomically renames
`alert-deals.json.tmp` to `alert-deals.json`.

Add this workflow step after enrichment and before generated content:

```yaml
- name: Build quality-qualified alert snapshot
  run: node scripts/build-alert-snapshot.js
```

Add `alert-deals.json` to the workflow commit list, `scripts/build-static.js`, and source/build verification.

- [ ] **Step 5: Run tests and generate the first snapshot**

Run:

```bash
node --test tests/alert-snapshot.test.js
node scripts/build-alert-snapshot.js
```

Expected: tests pass and `alert-deals.json` contains at least 20 uniquely keyed qualified deals.

- [ ] **Step 6: Commit the snapshot pipeline**

```bash
git add lib/alert-snapshot.js scripts/build-alert-snapshot.js tests/alert-snapshot.test.js alert-deals.json .github/workflows/update-deals.yml scripts/build-static.js scripts/verify-site.js
git commit -m "feat: publish quality-qualified alert snapshot"
```

### Task 2: Add notification and delivery persistence

**Files:**
- Create: `db/supabase-notifications.sql`
- Create: `tests/notification-schema.test.js`

**Interfaces:**
- Produces: `lr_alert_deliveries`.
- Produces: `lr_processed_snapshots`.
- Delivery uniqueness: `(user_id, condition_key)`.
- Owner can read delivery history; only service role can insert/update delivery and snapshot rows.

- [ ] **Step 1: Write the failing SQL contract**

Require:

```sql
create table if not exists public.lr_alert_deliveries
create unique index if not exists lr_alert_delivery_condition
  on public.lr_alert_deliveries(user_id, condition_key);
create table if not exists public.lr_processed_snapshots
```

Also require RLS on both tables, an authenticated owner `select` policy for deliveries, and no authenticated insert/update/delete policy for either server-owned table.

- [ ] **Step 2: Implement the schema**

Use:

```sql
create table if not exists public.lr_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null check (alert_type in ('target_price','free_game','weekly_digest')),
  game_key text,
  condition_key text not null,
  snapshot_id text not null,
  status text not null check (status in ('pending','sending','delivered','retryable','failed','suppressed')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create unique index if not exists lr_alert_delivery_condition
  on public.lr_alert_deliveries(user_id, condition_key);

create table if not exists public.lr_processed_snapshots (
  snapshot_id text primary key,
  updated_at timestamptz not null,
  processed_at timestamptz,
  qualified_deal_count integer not null check (qualified_deal_count >= 0),
  status text not null check (status in ('processing','processed','rejected','failed')),
  rejection_reason text
);
```

Enable RLS. Add only:

```sql
create policy "lr_alert_deliveries owner read"
  on public.lr_alert_deliveries for select to authenticated
  using ((select auth.uid()) = user_id);
```

- [ ] **Step 3: Run and apply**

Run: `node --test tests/notification-schema.test.js`

Expected: all tests pass. Then apply `db/supabase-notifications.sql` in the Supabase SQL editor and verify anon/authenticated roles cannot insert delivery rows.

- [ ] **Step 4: Commit**

```bash
git add db/supabase-notifications.sql tests/notification-schema.test.js
git commit -m "feat: add idempotent alert delivery schema"
```

### Task 3: Implement deterministic alert selection

**Files:**
- Create: `supabase/functions/_shared/alert-engine.ts`
- Create: `supabase/functions/_shared/alert-engine.test.ts`
- Create: `supabase/functions/deno.json`

**Interfaces:**
- Produces: `validateSnapshot(snapshot, now)`.
- Produces: `targetCandidates(snapshot, userId, watchlist, priorKeys)`.
- Produces: `freeCandidates(snapshot, userId, priorKeys)`.
- Produces: `digestCandidates(snapshot, userId, weekKey, priorKeys)`.
- Produces: `isDigestDue(preference, now)`.
- Produces stable `conditionKey` strings.

- [ ] **Step 1: Write failing Deno tests**

Cover:

- snapshot older than 8 hours is rejected;
- snapshot with fewer than 20 qualified deals is rejected;
- a target crossing emits one candidate;
- an identical snapshot/price band emits none when its key exists;
- a lower later price creates a new target price-band key;
- a free offer emits one candidate per offer condition;
- digest chooses five distinct titles and favors Deal Score while avoiding five identical stores;
- a Friday 10:00 digest is due only within its saved time-zone/hour window and
  is not due after that ISO week has a delivery key.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
deno test supabase/functions/_shared/alert-engine.test.ts
```

Expected: FAIL because `alert-engine.ts` does not exist.

- [ ] **Step 3: Implement exact condition keys**

Use:

```ts
export const targetKey = (
  userId: string,
  gameKey: string,
  targetPrice: number,
  currentPrice: number
) => `target:${userId}:${gameKey}:${Math.floor(targetPrice * 100)}:${Math.floor(currentPrice * 4)}`;

export const freeKey = (userId: string, gameKey: string, dealId: string) =>
  `free:${userId}:${gameKey}:${dealId}`;

export const digestKey = (userId: string, week: string) =>
  `digest:${userId}:${week}`;
```

`validateSnapshot()` checks object shape, exact deal count parity, unique game keys, HTTPS-safe/encoded deal IDs, finite values, `updatedAt <= now + 5 minutes`, and age no greater than 8 hours.

`digestCandidates()` takes the highest Deal Score deal, then greedily prefers a different store and title family until five are selected; if diversity is exhausted, fill by score.

`isDigestDue()` uses `Intl.DateTimeFormat` with the stored IANA time zone,
`digest_day`, and `digest_hour`. It returns a stable ISO-week key only during
that local hour and returns `null` outside the window.

- [ ] **Step 4: Run the engine tests**

Run: `deno test supabase/functions/_shared/alert-engine.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/alert-engine.ts supabase/functions/_shared/alert-engine.test.ts supabase/functions/deno.json
git commit -m "feat: implement deterministic alert selection"
```

### Task 4: Add signed unsubscribe tokens and email rendering

**Files:**
- Create: `supabase/functions/_shared/unsubscribe-token.ts`
- Create: `supabase/functions/_shared/unsubscribe-token.test.ts`
- Create: `supabase/functions/_shared/email-provider.ts`
- Create: `supabase/functions/_shared/email-templates.ts`
- Create: `supabase/functions/_shared/email-templates.test.ts`

**Interfaces:**
- Produces: `signUnsubscribe({ userId, category, expiresAt }, secret) -> string`.
- Produces: `verifyUnsubscribe(token, secret, now) -> payload`.
- Produces: `createResendProvider({ apiKey, from, fetchImpl })`.
- Provider method: `send(message, idempotencyKey) -> { id }`.

- [ ] **Step 1: Write token and template tests**

Test valid round-trip, tamper rejection, wrong-secret rejection, and expiration after 30 days. Test every HTML/text template contains the retailer caveat, LootRadar link, category unsubscribe link, all-email unsubscribe link, and no raw user ID.

- [ ] **Step 2: Implement HMAC-SHA-256 tokens**

Encode a versioned JSON payload with base64url and sign it with `crypto.subtle.sign('HMAC', ...)`. Allow only categories `target_price`, `free_game`, `weekly_digest`, and `all`. Use constant-time byte comparison and reject malformed payloads.

- [ ] **Step 3: Implement the Resend adapter**

Send `POST https://api.resend.com/emails` with:

```ts
headers: {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'User-Agent': 'LootRadar-Alerts/1.0',
  'Idempotency-Key': idempotencyKey
}
```

The body uses `LootRadar <deals@thelootradar.com>`, HTML and text versions, plus:

```ts
headers: {
  'List-Unsubscribe': `<${allUnsubscribeUrl}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
}
```

Return the provider `id`; classify 408, 429, and 5xx as retryable and all other non-2xx responses as failed.

- [ ] **Step 4: Run Deno tests**

Run:

```bash
deno test supabase/functions/_shared/unsubscribe-token.test.ts supabase/functions/_shared/email-templates.test.ts
```

Expected: all tests pass without network access.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat: add secure alert email and unsubscribe primitives"
```

### Task 5: Implement scheduled alert processing

**Files:**
- Create: `supabase/functions/process-alerts/index.ts`
- Create: `supabase/functions/process-alerts/deno.json`
- Create: `supabase/functions/process-alerts/index.test.ts`

**Interfaces:**
- Accepts: `POST` with `x-lootradar-cron-secret`.
- Fetches: `https://thelootradar.com/alert-deals.json`.
- Consumes: enabled preferences, watchlists, prior delivery keys.
- Produces: processed snapshot and delivery rows.

- [ ] **Step 1: Write orchestration tests with injected adapters**

Test invalid cron secret returns 401; stale snapshot creates a rejected snapshot and sends zero mail; repeated invocation sends zero duplicates; provider retry marks `retryable`; a failed snapshot fetch sends zero mail; disabled/unsubscribed preferences send zero mail.

- [ ] **Step 2: Implement processor phases**

Use four explicit phases:

1. authenticate cron and fetch/validate the public snapshot;
2. atomically claim `snapshot_id` with status `processing`;
3. load opted-in preferences and associated watchlists, then insert `pending` delivery rows with `upsert(..., { onConflict: 'user_id,condition_key', ignoreDuplicates: true })`;
4. resolve each user's email through `auth.admin.getUserById()`, send via the provider, and update status/provider ID.

Mark the snapshot `processed` only after candidate creation completes. A provider failure does not reopen snapshot selection; retry `retryable` rows using the same condition/idempotency key.

- [ ] **Step 3: Bound workload**

Process at most 100 pending/retryable deliveries per invocation, use at most five concurrent Resend requests, and stop after 8 minutes so Supabase Cron stays below its 10-minute guidance.

- [ ] **Step 4: Run processor tests**

Run:

```bash
deno test supabase/functions/process-alerts/index.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Deploy and commit**

Run:

```bash
supabase functions deploy process-alerts
git add supabase/functions/process-alerts
git commit -m "feat: process target free and weekly alerts"
```

### Task 6: Add one-click unsubscribe

**Files:**
- Create: `supabase/functions/unsubscribe/index.ts`
- Create: `supabase/functions/unsubscribe/index.test.ts`
- Create: `unsubscribe.html`
- Create: `unsubscribe.js`
- Modify: `scripts/build-static.js`
- Modify: `scripts/verify-site.js`

**Interfaces:**
- Accepts: browser `GET` for confirmation UI and RFC 8058 `POST` for immediate all-email unsubscribe.
- Token scopes: one category or `all`.
- Updates: the matching preference flag or all flags plus `unsubscribed_at`.

- [ ] **Step 1: Write endpoint tests**

Test valid category GET, valid all-email POST, expired/tampered token rejection, cross-user resistance, and idempotent repeated unsubscribe.

- [ ] **Step 2: Implement the public function**

Do not require a login. Verify the signed token, update only the embedded user ID and category using the service-role client, and return 200 for an already-disabled category. `POST` returns an empty 200 response; `GET` redirects to:

```text
https://thelootradar.com/unsubscribe.html?status=success&category=<encoded-category>
```

Never place the raw user ID in a URL.

- [ ] **Step 3: Add the static confirmation page**

`unsubscribe.html` is `noindex,follow`. `unsubscribe.js` accepts only allow-listed `status` and `category` values from the query string and writes messages with `textContent`.

- [ ] **Step 4: Build, test, deploy, and commit**

Run:

```bash
deno test supabase/functions/unsubscribe/index.test.ts
npm test
npm run build
npm run verify
supabase functions deploy unsubscribe --no-verify-jwt
git add supabase/functions/unsubscribe unsubscribe.html unsubscribe.js scripts/build-static.js scripts/verify-site.js
git commit -m "feat: add one-click alert unsubscribe"
```

Expected: tests pass and signed GET/POST unsubscribe requests work without an active session.

### Task 7: Activate dashboard notification controls and history

**Files:**
- Modify: `account.html`
- Modify: `account.js`
- Modify: `lib/analytics.js`
- Modify: `tests/analytics.test.js`
- Modify: `tests/account-page.test.js`
- Modify: `privacy.html`
- Modify: `terms.html`

**Interfaces:**
- Reads/writes: `lr_notification_preferences`.
- Reads: latest 20 `lr_alert_deliveries`.
- Analytics: `notification_toggle` with only `category` and `enabled`.

- [ ] **Step 1: Add failing UI and analytics tests**

Require three independent default-off toggles, browser time-zone detection, Friday/10:00 defaults, delivery history, and an all-email disable button. Verify analytics rejects emails, IDs, target prices, and game keys.

- [ ] **Step 2: Enable preferences only when production configuration is ready**

Add `window.LR_ALERTS_ENABLED = true` to the generated public config only after the Resend domain and functions are verified. When false/missing, keep controls disabled with `Email alerts are not available yet.`

When true, create the row on first explicit opt-in:

```js
await supabase.from('lr_notification_preferences').upsert({
  user_id: user.id,
  [column]: enabled,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  digest_day: 5,
  digest_hour: 10,
  unsubscribed_at: enabled ? null : preferences.unsubscribed_at,
  updated_at: new Date().toISOString()
});
```

Map categories to fixed column names; never accept a column name directly from DOM input.

- [ ] **Step 3: Render delivery history safely**

Select the latest 20 owner-visible rows ordered by `created_at desc`. Show type, status, and date only; resolve no private/game details through analytics.

- [ ] **Step 4: Update legal copy**

Describe explicit opt-in, each category, Resend delivery, source limits, final-price caveat, unsubscribe behavior, retention of delivery history, and deletion.

- [ ] **Step 5: Run and commit**

Run:

```bash
node --test tests/analytics.test.js tests/account-page.test.js
npm test
git add account.html account.js lib/analytics.js tests/analytics.test.js tests/account-page.test.js privacy.html terms.html
git commit -m "feat: add private deal alert controls"
```

### Task 8: Schedule, verify, and release notifications

**Files:**
- Create: `db/schedule-alerts.sql`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `.github/workflows/sync-supabase-config.yml`

**Interfaces:**
- Supabase Vault secrets: `lootradar_project_url`, `lootradar_cron_secret`.
- Edge Function secrets: `CRON_SECRET`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`.
- Cron schedule: `47 */3 * * *`, 30 minutes after the GitHub refresh begins.

- [ ] **Step 1: Add the exact schedule**

Create `db/schedule-alerts.sql`:

```sql
select cron.unschedule('lootradar-process-alerts')
where exists (select 1 from cron.job where jobname = 'lootradar-process-alerts');

select cron.schedule(
  'lootradar-process-alerts',
  '47 */3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'lootradar_project_url')
      || '/functions/v1/process-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lootradar-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'lootradar_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Configure external secrets**

Verify `thelootradar.com` in Resend, create a sending-only API key, set the three Edge Function secrets, and create the two named Vault secrets. The `CRON_SECRET` Edge Function value and `lootradar_cron_secret` Vault value must be the same randomly generated 32-byte value.

- [ ] **Step 3: Apply schedule and run a dry production pass**

Apply `db/schedule-alerts.sql`, keep all user preferences disabled, manually invoke the function, and confirm one valid snapshot is marked processed with zero deliveries.

- [ ] **Step 4: Test each category with one controlled account**

Enable one category at a time for a dedicated account. Confirm target, free, and digest templates, List-Unsubscribe headers, signed links, provider IDs, and duplicate suppression. Disable each category after its test.

- [ ] **Step 5: Activate the public controls**

Set `LR_ALERTS_ENABLED=true` in the config workflow, run it, and verify the account dashboard enables all three toggles. No existing account is opted in by this change.

- [ ] **Step 6: Run the final release gate**

Run:

```bash
npm test
deno test supabase/functions
npm run build
npm run verify
git diff --check
git pull --rebase origin main
git push origin main
```

Expected: all commands pass, production sends no stale/duplicate message, unsubscribe works without login, and users who did not opt in receive no deal email.

## Primary Implementation References

- Supabase OAuth sign-in: https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- Supabase identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase scheduled Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase server-only user deletion: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- Resend send API and idempotency: https://resend.com/docs/api-reference/emails/send-email
- Resend one-click unsubscribe headers: https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
