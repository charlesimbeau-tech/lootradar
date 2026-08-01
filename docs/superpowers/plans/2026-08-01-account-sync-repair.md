# Account Sync Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production account synchronization and make recommendation feedback controls easy to find.

**Architecture:** Promote the existing idempotent account SQL into the Supabase migrations directory and apply it to the linked production project. Route every browser surface through one cached Supabase client, while keeping the account data client responsible for merge and write behavior. Add explicit links and copy that lead users from the account dashboard and recommendation controls to the per-game feedback buttons.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase Auth/PostgREST/Postgres, Node.js built-in test runner, GitHub Pages.

## Global Constraints

- Keep the Supabase publishable key browser-safe; never expose a service-role key or session token.
- Preserve row-level security and owner-only access for every private account table.
- Keep local preferences usable when remote synchronization is unavailable.
- Do not add a framework or new runtime dependency.
- Validate production through public schema probes and a signed-in browser session without printing private account contents.

---

### Task 1: Production account schema

**Files:**
- Create: `supabase/migrations/20260801211500_account_sync.sql`
- Create: `supabase/migrations/20260801211600_account_notifications.sql`
- Modify: `README.md`
- Test: `tests/account-schema.test.js`

**Interfaces:**
- Consumes: the complete idempotent SQL contract in `db/supabase-recommendations.sql`.
- Produces: `lr_watchlist`, `lr_notification_preferences`, the four `lr_sync_*`/delete RPCs expected by `lib/account-client.js`, and the notification delivery tables read by `account.js`.

- [ ] **Step 1: Write the failing migration test**

Add assertions that both timestamped migrations exist, match their canonical SQL byte-for-byte, and retain their transaction boundaries so a partial application cannot be published.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/account-schema.test.js`

Expected: FAIL because `supabase/migrations/20260801211500_account_sync.sql` does not exist.

- [ ] **Step 3: Add the migration and deployment documentation**

Copy the complete canonical SQL into the timestamped migration. Update the README to use `supabase db push` for linked projects and retain the SQL Editor route as an explicit recovery path.

- [ ] **Step 4: Run the focused test and confirm success**

Run: `node --test tests/account-schema.test.js`

Expected: all account-schema tests pass.

- [ ] **Step 5: Apply and verify the production migration**

Apply the complete transaction through an authenticated Supabase CLI or SQL Editor session. Then probe the four tables with the public publishable key: every table must return HTTP 200 with RLS hiding other users' rows. Probe each RPC anonymously with a mismatched user ID: it must exist and reject authorization, not return HTTP 404.

### Task 2: One Supabase client per page

**Files:**
- Modify: `lib/auth-nav.js`
- Modify: `app.js`
- Modify: `recommendations.js`
- Modify: `account.js`
- Modify: `login.js`
- Test: `tests/auth-nav.test.js`
- Test: `tests/account-wiring.test.js`

**Interfaces:**
- Produces: `LootRadarAuthNav.clientFor(root) -> SupabaseClient|null`, cached as one client per browser page.
- Consumes: `window.supabase`, `window.LR_SUPABASE_URL`, and `window.LR_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Write failing singleton and wiring tests**

Test that two `clientFor(root)` calls return the same client, configuration failures return `null`, auth navigation uses the shared instance, and every account surface requests the cached client instead of calling `createClient` directly.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/auth-nav.test.js tests/account-wiring.test.js`

Expected: FAIL because the helper and script wiring are absent and multiple files call `createClient` directly.

- [ ] **Step 3: Implement the cached client**

Add a private client cache to `lib/auth-nav.js`, keyed by the supplied browser root. Replace direct `createClient` calls in the account surfaces with `LootRadarAuthNav.clientFor(window)`; keep a graceful guest/unavailable fallback.

- [ ] **Step 4: Run focused tests and confirm success**

Run: `node --test tests/auth-nav.test.js tests/account-wiring.test.js`

Expected: all singleton and wiring tests pass with no direct account-surface client creation outside the helper.

### Task 3: Discoverable preferences and game feedback

**Files:**
- Modify: `recommendations.html`
- Modify: `recommendations.js`
- Modify: `account.js`
- Modify: `recommendations.css`
- Test: `tests/account-page.test.js`
- Test: `tests/account-wiring.test.js`
- Test: `tests/editorial-copy.test.js`

**Interfaces:**
- Consumes: existing `.feedback-btn` actions and `recommendations.html` route.
- Produces: an account-dashboard link labeled `Edit preferences and rate games`, plus recommendation-page guidance that names the visible `More like this` and `Not for me` buttons.

- [ ] **Step 1: Write failing discoverability tests**

Assert that the account dashboard renders a stable recommendation-edit link and that the recommendation intro names both per-card actions without promising a generic Like button.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/account-page.test.js tests/account-wiring.test.js tests/editorial-copy.test.js`

Expected: FAIL because the dashboard has only a read-only preference summary and the current instruction says `Hit like`.

- [ ] **Step 3: Implement the smallest UI correction**

Add the dashboard link next to the preference summary. Add compact recommendation guidance above results, retain the existing per-card feedback controls, and replace `Hit like` with `Choose More like this`.

- [ ] **Step 4: Run focused tests and confirm success**

Run: `node --test tests/account-page.test.js tests/account-wiring.test.js tests/editorial-copy.test.js`

Expected: all account and editorial tests pass.

### Task 4: Regression, deployment, and live account verification

**Files:**
- Modify only if verification reveals a specific regression in the files above.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a deployed GitHub Pages build and evidence that local save, remote sync, and feedback persistence work.

- [ ] **Step 1: Run the complete local verification suite**

Run: `npm test && npm run build && npm run verify && git diff --check`

Expected: all tests pass; the build and site verifier exit zero; no whitespace errors.

- [ ] **Step 2: Publish the implementation**

Commit only the account-sync repair files, push them to the repository, and deploy through the existing GitHub Pages source branch.

- [ ] **Step 3: Verify the signed-in production path**

Open `/recommendations.html`, change one reversible preference, confirm `Synced`, reload, and confirm the value remains. Choose `More like this` on one game, confirm `Synced`, reload, and confirm the account summary reports one additional liked game; then restore the reversible preference/feedback choice.

- [ ] **Step 4: Verify public and repository state**

Confirm the homepage, recommendations page, account page, and public assets return HTTP 200; confirm GitHub Pages built the published commit; confirm `git status --short` is empty.

## Self-Review

- Spec coverage: production schema, sync writes, local fallback, duplicated Supabase clients, missing feedback discoverability, tests, deployment, and live signed-in verification are covered.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: the shared helper is consistently named `LootRadarAuthNav.clientFor(root)` and every consumer receives the same Supabase client contract.
