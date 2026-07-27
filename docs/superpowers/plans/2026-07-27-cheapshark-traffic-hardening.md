# CheapShark Traffic Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LootRadar tolerate CheapShark throttling and transient failures without publishing incomplete data or issuing redundant visitor requests.

**Architecture:** Add one dependency-free CheapShark client shared by Node.js refresh jobs and browser pages. The client owns retry timing, `Retry-After` handling, in-flight request deduplication, and short-lived response caching; the refresh script adds snapshot-quality gates before writing, while browser pages add cancellation and user-facing failure states.

**Tech Stack:** Node.js 20, browser JavaScript, Node's built-in test runner, GitHub Actions, static GitHub Pages deployment

## Global Constraints

- Keep the project dependency-free and preserve its static-site architecture.
- Send the existing descriptive `User-Agent` from the scheduled Node.js refresh.
- Never overwrite a healthy deal snapshot with a partial or implausibly small refresh.
- Keep user-driven CheapShark lookups in the visitor's browser, as CheapShark recommends.
- Do not migrate DNS, hosting providers, or billing in this implementation.

---

### Task 1: Shared CheapShark request client

**Files:**
- Create: `lib/cheapshark-client.js`
- Create: `tests/cheapshark-client.test.js`

**Interfaces:**
- Produces: `parseRetryAfter(value, nowMs) -> number`
- Produces: `createCheapSharkClient(options) -> { get(path, requestOptions), clearCache() }`
- `requestOptions` supports `signal`, `cacheKey`, and `cacheTtlMs`.

- [ ] **Step 1: Write failing retry and caching tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCheapSharkClient, parseRetryAfter } = require('../lib/cheapshark-client.js');

test('parseRetryAfter supports seconds', () => {
  assert.equal(parseRetryAfter('3', 0), 3000);
});

test('retries 429 using Retry-After before returning JSON', async () => {
  const waits = [];
  let calls = 0;
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test',
    sleep: async milliseconds => waits.push(milliseconds),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 429, headers: { get: () => '2' } };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true }) };
    }
  });

  assert.deepEqual(await client.get('/deals'), { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});

test('deduplicates in-flight requests and caches successful responses', async () => {
  let calls = 0;
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ calls }) };
    }
  });

  const [first, second] = await Promise.all([
    client.get('/games?title=portal', { cacheTtlMs: 60000 }),
    client.get('/games?title=portal', { cacheTtlMs: 60000 })
  ]);
  const third = await client.get('/games?title=portal', { cacheTtlMs: 60000 });

  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run the client tests and confirm the module is missing**

Run: `node --test tests/cheapshark-client.test.js`

Expected: FAIL because `lib/cheapshark-client.js` does not exist.

- [ ] **Step 3: Implement the universal client**

```js
(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LootRadarCheapShark = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildClient() {
  function parseRetryAfter(value, nowMs = Date.now()) {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateMs = Date.parse(value);
    return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : 0;
  }

  function createCheapSharkClient(options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const cache = new Map();
    const inFlight = new Map();

    async function request(path, requestOptions = {}) {
      const url = new URL(path, options.baseUrl || 'https://www.cheapshark.com/api/1.0').toString();
      const key = requestOptions.cacheKey || url;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      if (inFlight.has(key)) return inFlight.get(key);

      const promise = (async () => {
        for (let attempt = 0; attempt <= (options.maxRetries ?? 3); attempt += 1) {
          try {
            const response = await fetchImpl(url, {
              headers: options.headers || { Accept: 'application/json' },
              signal: requestOptions.signal
            });
            if (response.ok) {
              const value = await response.json();
              if (requestOptions.cacheTtlMs > 0) {
                cache.set(key, { value, expiresAt: Date.now() + requestOptions.cacheTtlMs });
              }
              return value;
            }
            if (response.status !== 429 && response.status < 500) {
              throw new Error(`HTTP ${response.status} for ${url}`);
            }
            if (attempt === (options.maxRetries ?? 3)) {
              throw new Error(`HTTP ${response.status} for ${url}`);
            }
            const retryAfter = parseRetryAfter(response.headers?.get?.('Retry-After'));
            await sleep(retryAfter || Math.min(30000, (options.baseDelayMs || 750) * (2 ** attempt)));
          } catch (error) {
            if (error?.name === 'AbortError' || attempt === (options.maxRetries ?? 3)) throw error;
            await sleep(Math.min(30000, (options.baseDelayMs || 750) * (2 ** attempt)));
          }
        }
      })().finally(() => inFlight.delete(key));

      inFlight.set(key, promise);
      return promise;
    }

    return { get: request, clearCache: () => cache.clear() };
  }

  return { createCheapSharkClient, parseRetryAfter };
});
```

- [ ] **Step 4: Run the client tests**

Run: `node --test tests/cheapshark-client.test.js`

Expected: 3 tests pass and 0 fail.

### Task 2: Safe scheduled refresh

**Files:**
- Create: `lib/deal-snapshot-validator.js`
- Modify: `scripts/fetch-deals.js`
- Modify: `.github/workflows/update-deals.yml`
- Create: `tests/fetch-deals-safety.test.js`

**Interfaces:**
- Consumes: `createCheapSharkClient()` from Task 1.
- Produces: `lib/deal-snapshot-validator.js` with `validateSnapshot(nextSnapshot, previousSnapshot, failures) -> void`, throwing on unsafe output.

- [ ] **Step 1: Write failing snapshot-safety tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSnapshot } = require('../lib/deal-snapshot-validator.js');

test('rejects a refresh containing failed stores', () => {
  assert.throws(
    () => validateSnapshot({ dealCount: 900, storeCount: 14 }, { dealCount: 1000 }, ['Steam']),
    /failed stores/i
  );
});

test('rejects an implausible deal-count collapse', () => {
  assert.throws(
    () => validateSnapshot({ dealCount: 400, storeCount: 14 }, { dealCount: 1000 }, []),
    /deal count/i
  );
});

test('accepts a complete snapshot within the safety threshold', () => {
  assert.doesNotThrow(
    () => validateSnapshot({ dealCount: 850, storeCount: 14 }, { dealCount: 1000 }, [])
  );
});
```

- [ ] **Step 2: Run the safety tests and confirm the export is missing**

Run: `node --test tests/fetch-deals-safety.test.js`

Expected: FAIL because `lib/deal-snapshot-validator.js` does not exist.

- [ ] **Step 3: Route all scheduled requests through the shared client**

```js
const { createCheapSharkClient } = require('../lib/cheapshark-client.js');
const client = createCheapSharkClient({
  baseUrl: API,
  maxRetries: 4,
  baseDelayMs: 1000,
  headers: {
    'User-Agent': 'LootRadar-Bot/1.2 (contact@thelootradar.com; https://thelootradar.com)',
    Accept: 'application/json'
  }
});

async function fetchJSON(path) {
  return client.get(path);
}
```

- [ ] **Step 4: Add quality gates before writing**

Create `lib/deal-snapshot-validator.js`:

```js
function validateSnapshot(nextSnapshot, previousSnapshot, failures) {
  if (failures.length) throw new Error(`Refresh aborted; failed stores: ${failures.join(', ')}`);
  const previousCount = Number(previousSnapshot?.dealCount || 0);
  const minimumCount = Math.max(500, Math.floor(previousCount * 0.6));
  if (nextSnapshot.dealCount < minimumCount) {
    throw new Error(`Refresh aborted; deal count ${nextSnapshot.dealCount} is below safety minimum ${minimumCount}`);
  }
}

module.exports = { validateSnapshot };
```

Then import it in `scripts/fetch-deals.js`, read the existing snapshot before refreshing, collect failed store names, call `validateSnapshot(output, previousSnapshot, failedStores)`, and write `deals.json` only after validation succeeds.

Keep the executable entry point guarded so the module can be inspected without starting a network refresh:

```js
if (require.main === module) main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 5: Reduce the automated schedule**

```yaml
on:
  schedule:
    - cron: '17 */3 * * *'
  workflow_dispatch:
```

This refreshes every three hours at a non-zero minute to avoid the busiest scheduler boundary.

- [ ] **Step 6: Run refresh safety tests**

Run: `node --test tests/fetch-deals-safety.test.js`

Expected: 3 tests pass and 0 fail.

### Task 3: Browser request cancellation and caching

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `games.html`
- Modify: `scripts/verify-site.js`

**Interfaces:**
- Consumes: `window.LootRadarCheapShark.createCheapSharkClient()`.
- Uses five-minute caches for detail, search, and featured-deal responses.

- [ ] **Step 1: Load the client before page-specific scripts**

```html
<script src="lib/cheapshark-client.js?v=1"></script>
```

Add it before `app.js` on the homepage and before the inline application script on `games.html`.

- [ ] **Step 2: Replace the homepage detail request**

```js
const cheapShark = window.LootRadarCheapShark.createCheapSharkClient({
  baseUrl: API,
  maxRetries: 2,
  baseDelayMs: 750
});

const lookup = await cheapShark.get(`/deals?id=${encodeURIComponent(deal.dealID)}`, {
  signal: state.detailController.signal,
  cacheTtlMs: 5 * 60 * 1000
});
```

Keep the existing cached-detail fallback message on failure.

- [ ] **Step 3: Harden game search**

Create a `searchController`, increase the debounce to 500 ms, abort the prior request before a new search, and fetch through:

```js
const games = await cheapShark.get(`/games?title=${encodeURIComponent(q)}&limit=20`, {
  signal: searchController.signal,
  cacheKey: `search:${q.toLowerCase()}`,
  cacheTtlMs: 5 * 60 * 1000
});
```

Ignore `AbortError`; for other errors render `Search is temporarily unavailable. Please try again.`

- [ ] **Step 4: Cache game details and featured deals**

```js
const data = await cheapShark.get(`/games?id=${encodeURIComponent(gameID)}`, {
  cacheTtlMs: 5 * 60 * 1000
});

const deals = await cheapShark.get('/deals?sortBy=Deal+Rating&upperPrice=60&pageSize=24', {
  cacheTtlMs: 5 * 60 * 1000
});
```

Preserve the existing visible fallback for game-detail failure and add a compact fallback message when featured deals cannot load.

- [ ] **Step 5: Extend site verification**

```js
for (const file of ['lib/cheapshark-client.js', 'dist/static/lib/cheapshark-client.js']) {
  if (!fs.existsSync(path.join(root, file))) failures.push(file);
}
for (const file of ['index.html', 'games.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes('lib/cheapshark-client.js')) failures.push(`${file} missing CheapShark client`);
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: all existing and new tests pass.

### Task 4: Validate and publish

**Files:**
- Verify: all modified files

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: a validated static build ready for the existing production host.

- [ ] **Step 1: Build the static deployment**

Run: `npm run build`

Expected: exit code 0 and `dist/static/lib/cheapshark-client.js` exists.

- [ ] **Step 2: Run the site verifier**

Run: `npm run verify`

Expected: exit code 0 with source assets, build assets, JSON data, AdSense wiring, and CheapShark client wiring verified.

- [ ] **Step 3: Check the patch**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Commit and publish**

```bash
git add .github/workflows/update-deals.yml app.js games.html index.html lib/cheapshark-client.js lib/deal-snapshot-validator.js scripts/fetch-deals.js scripts/verify-site.js tests/cheapshark-client.test.js tests/fetch-deals-safety.test.js docs/superpowers/plans/2026-07-27-cheapshark-traffic-hardening.md
git commit -m "feat: harden CheapShark traffic handling"
git pull --rebase origin main
git push origin main
```

Expected: the production branch contains the hardening commit without overwriting newer generated deal data.
