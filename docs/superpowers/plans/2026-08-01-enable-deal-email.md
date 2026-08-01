# Deal Email Production Enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely enable LootRadar's existing default-off deal-email system in production and prove that a signed-in user can opt in, receive a real alert, and unsubscribe.

**Architecture:** Keep the checked-in Supabase Edge Function and Resend provider design. Provision scoped production credentials, deploy the processor and unsubscribe functions, schedule the processor with Supabase Vault plus `pg_cron`, exercise the pipeline while the public gate is still off, and only then publish `LR_ALERTS_ENABLED=true`.

**Tech Stack:** Supabase Edge Functions/Deno, PostgreSQL Vault/pg_cron/pg_net, Resend, GitHub Actions/Pages, vanilla JavaScript.

## Global Constraints

- Email preferences remain default-off; enabling the feature must not opt in existing accounts.
- Sender credentials stay server-side and never enter the repository or browser configuration.
- The production sender is restricted to the verified `thelootradar.com` domain.
- Every recurring message includes category and global unsubscribe links.
- Temporary deployment credentials are revoked after use.

---

### Task 1: Verify the Existing Pipeline

**Files:**
- Test: `supabase/functions/_shared/*.test.ts`
- Test: `supabase/functions/process-alerts/index.test.ts`
- Test: `supabase/functions/unsubscribe/index.test.ts`

**Interfaces:**
- Consumes: checked-in alert snapshot, templates, Resend provider, and repository implementation.
- Produces: a passing Deno test baseline suitable for production deployment.

- [ ] Run `deno test supabase/functions` and require every function test to pass.
- [ ] Run `npm test`, `npm run build`, and `npm run verify` and require all site checks to pass.

### Task 2: Provision and Deploy Server Configuration

**Files:**
- Deploy: `supabase/functions/process-alerts/index.ts`
- Deploy: `supabase/functions/unsubscribe/index.ts`
- Deploy: `supabase/functions/delete-account/index.ts`
- Configure: `supabase/config.toml`

**Interfaces:**
- Consumes: `CRON_SECRET`, `RESEND_API_KEY`, and `UNSUBSCRIBE_SECRET` as encrypted Supabase secrets.
- Produces: live `process-alerts`, `unsubscribe`, and `delete-account` endpoints.

- [ ] Create a Resend sending-only key restricted to `thelootradar.com`.
- [ ] Generate independent random cron and unsubscribe secrets with at least 32 bytes of entropy.
- [ ] Store all three values with `supabase secrets set`.
- [ ] Deploy all three functions with the gateway JWT settings in `supabase/config.toml`.
- [ ] Confirm the functions and secret names from the production control plane.

### Task 3: Schedule the Processor

**Files:**
- Apply: `db/schedule-alerts.sql`

**Interfaces:**
- Consumes: Vault entries `lootradar_project_url` and `lootradar_cron_secret`.
- Produces: one `lootradar-process-alerts` cron job at `47 */3 * * *`.

- [ ] Enable `pg_cron` and `pg_net` if they are not already enabled.
- [ ] Store the project URL and the exact cron secret in Supabase Vault.
- [ ] Apply `db/schedule-alerts.sql`.
- [ ] Query `cron.job` and require exactly one active LootRadar alert job.

### Task 4: Prove Delivery Before Release

**Files:**
- Verify: `alert-deals.json`
- Verify: `supabase/functions/process-alerts/index.ts`
- Verify: `supabase/functions/unsubscribe/index.ts`

**Interfaces:**
- Consumes: the live signed-in test account and current production alert snapshot.
- Produces: a real Resend delivery record plus a verified preference/unsubscribe path.

- [ ] Invoke the processor with every preference disabled and require a successful zero-delivery response.
- [ ] Opt the controlled account into one category and arrange one qualifying real condition.
- [ ] Invoke the processor and require one `delivered` row with a provider message ID.
- [ ] Confirm the message appears in Resend and that its unsubscribe URL disables the matching preference.
- [ ] Restore temporary watchlist and preference changes.

### Task 5: Publish the Feature Gate

**Files:**
- Generate: `supabase-config.js`
- Verify: `account.html`
- Verify: `account.js`

**Interfaces:**
- Consumes: GitHub repository variable `LR_ALERTS_ENABLED=true`.
- Produces: enabled, default-off deal-email controls on the live account dashboard.

- [ ] Set the repository variable to `true` and run the Sync Supabase Config workflow.
- [ ] Wait for the exact configuration commit and GitHub Pages build to complete.
- [ ] Confirm the live account page enables all three toggles, saves a preference, reloads it, and shows recent delivery history.
- [ ] Revoke the temporary Supabase deployment token and remove local credential files.

