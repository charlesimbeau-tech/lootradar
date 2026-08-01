# Personalized Weekly Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn LootRadar's operational weekly email into a personalized, owner-previewable five-deal digest delivered close to each subscriber's saved Friday 10:00 a.m. local time.

**Architecture:** Enrich the immutable alert snapshot with bounded genre metadata, then rank each subscriber's digest from their private Supabase profile while keeping delivery selection deterministic and idempotent. Add an authenticated, server-authorized admin Edge Function and noindex browser page for preview/test delivery. Run the existing processor hourly with a one-hour local due window.

**Tech Stack:** Vanilla JavaScript, Node test runner, Deno/Supabase Edge Functions, PostgreSQL Vault/pg_cron/pg_net, Resend, GitHub Pages.

## Global Constraints

- Existing accounts remain opted out until `weekly_digest_enabled` is explicitly true.
- Private profiles and the admin allowlist stay server-side; no service-role key or owner identifier enters public configuration.
- Digest selection always produces exactly five distinct qualified deals or safely produces no delivery.
- Saved price limits and trusted stores are hard constraints; genres and positive feedback rank matching deals higher, while negative feedback excludes the current deal.
- Every real and test message includes working category and global unsubscribe links.
- One delivery key per user and ISO week remains the idempotency boundary.

---

### Task 1: Personalized Snapshot and Selection

**Files:**
- Modify: `lib/alert-snapshot.js`
- Modify: `tests/alert-snapshot.test.js`
- Modify: `supabase/functions/_shared/alert-engine.ts`
- Modify: `supabase/functions/_shared/alert-engine.test.ts`
- Modify: `supabase/functions/process-alerts/index.ts`
- Modify: `supabase/functions/process-alerts/index.test.ts`

**Interfaces:**
- Consumes: ranked deal rows with `genres`, profile JSON from `public.lr_profiles.data`, and the existing qualified snapshot.
- Produces: `DigestProfile`, `normalizeDigestProfile(value)`, and `digestCandidates(snapshot, userId, weekKey, priorKeys, profile)`.

- [ ] **Step 1: Add failing snapshot tests**

Assert every generated alert deal carries a deduplicated bounded `genres: string[]`, and validation rejects non-string/control-character genre values.

- [ ] **Step 2: Run `node --test tests/alert-snapshot.test.js`**

Expected: FAIL because alert deals do not yet publish genre metadata.

- [ ] **Step 3: Publish validated genre metadata**

Copy at most 20 distinct non-empty normalized genres from each ranked deal into the alert snapshot and validate the field in both the Node and Deno validators.

- [ ] **Step 4: Add failing personalization tests**

Cover price-limit exclusion, trusted-store exclusion, negative-feedback exclusion, genre/positive-feedback ranking, five-deal diversity, deterministic ordering, and global-quality fallback when no profile exists.

- [ ] **Step 5: Implement deterministic personalized selection**

Define a normalized profile boundary with `budget`, `genres`, `stores`, `genreMatchMode`, `likes`, and `dislikes`. Filter by budget/stores/dislikes, calculate a stable personalization score from Deal Score plus genre and like boosts, and feed the resulting order into the existing store/title-family diversity picker.

- [ ] **Step 6: Load private profiles in the processor**

Add `AlertRepository.loadDigestProfiles(userIds)` and `RestAlertRepository.loadDigestProfiles(userIds)` using service-role paginated reads of `lr_profiles(user_id,data)`. Pass the resulting user map into candidate creation and delivery reconstruction.

- [ ] **Step 7: Run function and snapshot tests**

Run: `node --test tests/alert-snapshot.test.js && deno test supabase/functions`

Expected: all tests pass with deterministic personalized selections.

### Task 2: Trusted Store Preferences

**Files:**
- Modify: `recommendations.html`
- Modify: `recommendations.js`
- Modify: `recommendations.css`
- Modify: `account.js`
- Modify: `tests/account-page.test.js`
- Modify: `tests/account-sync-integration.test.js`

**Interfaces:**
- Consumes: the already-loaded `stores` map and synchronized recommendation profile.
- Produces: a sorted `profile.stores: string[]`; an empty list means any participating store.

- [ ] **Step 1: Add failing browser-source tests**

Require a discoverable "Stores you trust" control, safe text-node rendering, profile persistence, and filtering that accepts only selected store names.

- [ ] **Step 2: Run the focused account tests**

Run: `node --test tests/account-page.test.js tests/account-sync-integration.test.js`

Expected: FAIL because no store chooser exists.

- [ ] **Step 3: Implement the store chooser and filtering**

Render one checkbox per available store after datasets load, persist the selected names through the existing account client, treat an empty set as any store, and exclude untrusted stores in recommendation scoring.

- [ ] **Step 4: Run focused tests**

Expected: all focused account tests pass and existing profiles without `stores` remain compatible.

### Task 3: Owner Preview and Test Send

**Files:**
- Create: `supabase/functions/digest-admin/index.ts`
- Create: `supabase/functions/digest-admin/index.test.ts`
- Create: `digest-admin.html`
- Create: `digest-admin.js`
- Modify: `supabase/config.toml`
- Modify: `scripts/build-static.js`
- Modify: `scripts/verify-site.js`
- Create: `tests/digest-admin-page.test.js`

**Interfaces:**
- Consumes: authenticated bearer token, `DIGEST_ADMIN_USER_IDS`, existing Supabase/Resend/unsubscribe secrets, the live alert snapshot, and the caller's private profile.
- Produces: POST `{action:"preview"}` returning safe deal fields and POST `{action:"send_test"}` returning only a provider delivery identifier.

- [ ] **Step 1: Add failing Edge Function authorization tests**

Cover missing/invalid sessions, authenticated non-admin callers, missing allowlist configuration, preview success without provider calls, and test-send success to the caller's verified account email only.

- [ ] **Step 2: Implement the server-authorized admin endpoint**

Resolve the caller through Supabase Auth, compare the user ID against the server-only comma-separated allowlist, fetch/validate the live snapshot and private profile, render the same personalized template used by the scheduled processor, and use signed unsubscribe URLs for test delivery.

- [ ] **Step 3: Add the noindex admin page and failing source tests**

Require session reuse through `LootRadarAuthNav`, a preview button, an explicit test-send confirmation button, text-only rendering, status feedback, and no service credential or admin identifier in browser source.

- [ ] **Step 4: Implement the admin page**

Call the Edge Function with the signed-in access token, render the exact five selected deals with prices/stores/reasons, and keep test send as a separate user action.

- [ ] **Step 5: Run admin tests**

Run: `deno test supabase/functions/digest-admin && node --test tests/digest-admin-page.test.js`

Expected: all authorization, preview, send, and private-page tests pass.

### Task 4: Hourly Scheduling, Deployment, and Live Proof

**Files:**
- Modify: `db/schedule-alerts.sql`
- Modify: `tests/notification-schema.test.js`
- Modify: `docs/email-setup.md`

**Interfaces:**
- Consumes: Vault entries `lootradar_project_url` and `lootradar_cron_secret`.
- Produces: one active `lootradar-process-alerts` job at `7 * * * *` and a 60-minute local due window.

- [ ] **Step 1: Add a failing hourly-schedule test**

Require `7 * * * *`, reject the retired three-hour expression, and assert the processor's due window is 60 minutes.

- [ ] **Step 2: Implement hourly scheduling and update operator documentation**

Change the cron expression and digest window while preserving ISO-week duplicate suppression and daylight-saving-safe IANA timezone evaluation.

- [ ] **Step 3: Run full verification**

Run: `deno test supabase/functions`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check`.

Expected: zero failures, a successful build, and verified source/build parity.

- [ ] **Step 4: Deploy server and database changes**

Set `DIGEST_ADMIN_USER_IDS` as an encrypted Supabase secret, deploy `process-alerts` and `digest-admin`, apply `db/schedule-alerts.sql`, and require exactly one active hourly job.

- [ ] **Step 5: Publish and verify production**

Commit and push the tested source, wait for the exact GitHub Pages SHA, open the noindex admin page with the signed-in owner account, require a five-deal personalized preview, deliberately send one labeled test digest, confirm Resend delivery, and confirm scheduled preferences remain default-off.
