# CheapShark Hybrid Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase unique price coverage without exceeding the existing 70-request refresh budget or the 40-request-starts-per-minute pacing ceiling.

**Architecture:** Keep the primary per-store DealRating sweep because it can detect removals and avoid publishing stale offers. Replace the duplicated two-page Recent sweep for every store with one bounded Recent sweep across all active store IDs, then reserve that smaller global budget for the end of the run. Allow high-yield stores to page deeper, while the global request counter remains the binding limit and each waiting store retains its two-page floor.

**Tech Stack:** Node.js 24, CommonJS, Node's built-in test runner, GitHub Actions YAML, CheapShark API 1.0.

## Global Constraints

- Start CheapShark requests no faster than once every 1,500 milliseconds.
- Make no more than 70 HTTP requests in one scheduled refresh, including `/stores`.
- Preserve complete-snapshot validation; any primary store failure must still abort publication.
- Treat the global Recent pass as additive and best-effort.
- Do not use `maxAge` as a deletion feed; CheapShark does not document it as one.
- Keep changes local and uncommitted for user review.

---

### Task 1: Pin the hybrid request shape with failing tests

**Files:**
- Modify: `tests/fetch-deals-safety.test.js`
- Modify: `tests/workflow-refresh.test.js`

**Interfaces:**
- Consumes: `.github/workflows/update-deals.yml` numeric environment settings and `scripts/fetch-deals.js` source structure.
- Produces: regression assertions for `GLOBAL_RECENT_PAGES`, a single global Recent pass, and budget feasibility.

- [ ] **Step 1: Replace the per-store Recent budget assertion**

```js
assert.match(workflow, /GLOBAL_RECENT_PAGES: \d+/);
assert.doesNotMatch(workflow, /RECENT_PAGES_PER_STORE:/);
```

- [ ] **Step 2: Require the Recent pass to run after the store loop**

```js
const storeLoop = source.indexOf('for (const store of activeStores)');
const recentPass = source.indexOf('GLOBAL_RECENT_PAGES > 0');
assert.ok(recentPass > storeLoop);
assert.match(source.slice(recentPass), /recent pass skipped/);
```

- [ ] **Step 3: Update budget arithmetic**

```js
const mandatory = stores * floor + globalRecent + 1;
assert.ok(mandatory <= budget);
assert.ok(ceiling > floor);
```

- [ ] **Step 4: Run tests and confirm they fail before implementation**

Run: `node --test tests/fetch-deals-safety.test.js tests/workflow-refresh.test.js`

Expected: FAIL because the current workflow still declares `RECENT_PAGES_PER_STORE` and the script runs Recent inside each store iteration.

### Task 2: Implement one global Recent pass with reserved budget

**Files:**
- Modify: `scripts/fetch-deals.js`
- Modify: `.github/workflows/update-deals.yml`
- Modify: `marketing/cheapshark-outreach-email.md`

**Interfaces:**
- Consumes: `fetchJSON(pathname)`, the existing `requestsUsed` counter, and `activeStores`.
- Produces: `fetchDealPages(storeIDs, sortBy, pageLimit, options)` and one best-effort global Recent collection.

- [ ] **Step 1: Replace the per-store setting**

```js
const GLOBAL_RECENT_PAGES = Number(process.env.GLOBAL_RECENT_PAGES || 8);
```

- [ ] **Step 2: Generalize the page fetcher**

```js
async function fetchDealPages(storeIDs, sortBy, pageLimit, options = {}) {
  const storeFilter = storeIDs ? `storeID=${storeIDs}&` : '';
  // Retain request-ceiling, sparse-page, and adaptive-yield checks.
}
```

- [ ] **Step 3: Reserve the global Recent budget**

```js
const recentReserve = GLOBAL_RECENT_PAGES;
const minimumPrimaryBudget = 1 + activeStores.length * PAGES_PER_STORE;
const rankedCeiling = Math.min(
  MAX_REQUESTS,
  Math.max(minimumPrimaryBudget, MAX_REQUESTS - recentReserve)
);
```

- [ ] **Step 4: Reserve the waiting stores' page floor**

```js
const remainingStores = activeStores.length - storeIndex - 1;
const storeCeiling = calculateStoreCeiling(
  rankedCeiling,
  remainingStores,
  PAGES_PER_STORE
);
```

- [ ] **Step 5: Fetch Recent once after all primary stores**

```js
if (GLOBAL_RECENT_PAGES > 0 && requestsUsed < MAX_REQUESTS) {
  try {
    const storeIDs = activeStores.map(store => store.storeID).join(',');
    const recent = await fetchDealPages(storeIDs, 'Recent', GLOBAL_RECENT_PAGES);
    allDeals.push(...recent);
  } catch (error) {
    console.warn(`Global recent pass skipped - ${error.message}`);
  }
}
```

- [ ] **Step 6: Configure the workflow**

```yaml
PAGES_PER_STORE: 2
GLOBAL_RECENT_PAGES: 8
MAX_PAGES_PER_STORE: 5
MAX_REQUESTS: 70
REQUEST_INTERVAL_MS: 1500
```

- [ ] **Step 7: Run focused tests**

Run: `node --test tests/cheapshark-client.test.js tests/fetch-deals-safety.test.js tests/workflow-refresh.test.js`

Expected: all focused tests pass.

- [ ] **Step 8: Keep the CheapShark usage description accurate**

Update `marketing/cheapshark-outreach-email.md` to state the 70-request hard
ceiling, 1,500 ms request-start interval, two-to-five adaptive ranked pages,
and one eight-page global Recent pass.

### Task 3: Verify the complete site and inspect scope

**Files:**
- Verify only: all modified files and generated outputs.

**Interfaces:**
- Consumes: the implementation from Tasks 1 and 2.
- Produces: fresh evidence that tests, build, static verification, and whitespace checks pass.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Build and verify**

Run: `npm run build && npm run verify`

Expected: both commands exit 0 and generated source files remain unchanged.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors and only the pacing/hybrid-refresh implementation, tests, workflow, and this plan are modified.
