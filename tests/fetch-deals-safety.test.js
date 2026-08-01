const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateSnapshot
} = require('../lib/deal-snapshot-validator.js');
const {
  calculateStoreCeiling
} = require('../scripts/fetch-deals.js');

test('rejects a refresh containing failed stores', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 900, storeCount: 14 },
      { dealCount: 1000, storeCount: 14 },
      ['Steam']
    ),
    /failed stores: Steam/i
  );
});

test('rejects an implausible deal-count collapse', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 400, storeCount: 14 },
      { dealCount: 1000, storeCount: 14 },
      []
    ),
    /deal count 400 is below safety minimum 600/i
  );
});

test('rejects an implausible active-store collapse', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 900, storeCount: 7 },
      { dealCount: 1000, storeCount: 14 },
      []
    ),
    /store count 7 is below safety minimum 11/i
  );
});

test('rejects a first refresh with too few deals', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 499, storeCount: 14 },
      null,
      []
    ),
    /deal count 499 is below safety minimum 500/i
  );
});

test('accepts a complete snapshot within the safety thresholds', () => {
  assert.doesNotThrow(
    () => validateSnapshot(
      { dealCount: 850, storeCount: 14 },
      { dealCount: 1000, storeCount: 14 },
      []
    )
  );
});

test('the recent-release pass cannot abort an otherwise healthy refresh', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'fetch-deals.js'),
    'utf8'
  );

  // The primary pass is load-bearing: a store failure there must reach
  // validateSnapshot, which aborts rather than publishing a thin snapshot.
  assert.match(
    source,
    /catch \(error\) \{\s*failedStores\.push\(store\.storeName\)/,
    'a failure in the primary DealRating pass must mark the store as failed'
  );

  // The recent pass is additive and global. Running it once after the primary
  // store loop avoids fetching the same recent listings fourteen times.
  const storeLoop = source.indexOf('for (const [storeIndex, store] of activeStores.entries())');
  const recentStart = source.indexOf('GLOBAL_RECENT_PAGES > 0');
  assert.ok(storeLoop >= 0, 'the primary store loop must exist');
  assert.ok(recentStart > storeLoop, 'the global recent pass must follow the primary store loop');
  const recentBlock = source.slice(recentStart, source.indexOf('const deduped', recentStart));
  assert.match(recentBlock, /recent pass skipped/i, 'the recent pass must warn on failure');
  assert.doesNotMatch(
    recentBlock,
    /failedStores\.push/,
    'the recent pass must not abort the refresh'
  );
  assert.match(recentBlock, /activeStores\.map\(store => store\.storeID\)\.join\(','\)/);

  assert.match(source, /sortBy=\$\{sortBy\}/, 'both passes share one query builder');
  assert.match(source, /releaseDate: d\.releaseDate/, 'release dates must survive into the snapshot');
});

test('the workflow declares one global recent-pass page budget', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  assert.match(workflow, /GLOBAL_RECENT_PAGES: \d+/);
  assert.doesNotMatch(workflow, /RECENT_PAGES_PER_STORE:/);
});

test('depth is bounded by a request budget and a per-page quality floor', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'fetch-deals.js'),
    'utf8'
  );

  // Without a budget, deeper paging across 14 stores would trip CheapShark's
  // rate limiter, which answers with a one-hour block.
  assert.match(source, /requestsUsed >= ceiling/, 'paging must respect a request ceiling');
  assert.match(source, /MAX_REQUESTS/, 'a global budget must exist');
  assert.match(
    source,
    /pageYield\(deals\) < MIN_PAGE_YIELD/,
    'paging must stop when a page stops yielding usable deals'
  );
  // The floor guarantees the adaptive path never fetches less than the old fixed depth.
  assert.match(
    source,
    /page \+ 1 >= PAGES_PER_STORE/,
    'the quality stop must not kick in before the guaranteed page floor'
  );
  assert.match(
    source,
    /recentReserve = GLOBAL_RECENT_PAGES[\s\S]*rankedCeiling/,
    'the recent pass needs reserved budget so a deep primary pass cannot starve it'
  );
});

test('the refresh workflow cannot outlive its own schedule', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  const timeout = Number((workflow.match(/timeout-minutes:\s*(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(timeout), 'the refresh job must declare a timeout');
  assert.ok(timeout < 180, `timeout ${timeout}m must stay under the 3 hour cron interval`);
  for (const key of ['MAX_PAGES_PER_STORE', 'MIN_PAGE_YIELD', 'MAX_REQUESTS']) {
    assert.match(workflow, new RegExp(`${key}:`), `${key} should be tunable from the workflow`);
  }
  const requestInterval = Number((workflow.match(/REQUEST_INTERVAL_MS:\s*(\d+)/) || [])[1]);
  assert.ok(
    requestInterval >= 1500,
    `request interval ${requestInterval}ms would exceed the configured 40 starts/minute ceiling`
  );
});

test('deep stores cannot consume the guaranteed floor for stores still waiting', () => {
  assert.equal(calculateStoreCeiling(62, 13, 2), 36);
  assert.equal(calculateStoreCeiling(62, 2, 2), 58);
  assert.equal(calculateStoreCeiling(62, 0, 2), 62);
});

test('refresh depth stays inside the rate limit CheapShark actually enforces', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  const num = key => {
    const line = workflow.split('\n').find(entry => entry.trim().startsWith(key + ':'));
    return Number((line || '').split(':')[1]);
  };

  const stores = 14;
  const floor = num('PAGES_PER_STORE');
  const ceiling = num('MAX_PAGES_PER_STORE');
  const recent = num('GLOBAL_RECENT_PAGES');
  const budget = num('MAX_REQUESTS');
  const mandatory = stores * floor + recent + 1;

  assert.ok(
    mandatory <= budget,
    `mandatory ${mandatory} requests leave no room inside budget ${budget}`
  );
  assert.ok(ceiling >= 5, 'the hybrid refresh must permit deeper high-yield store paging');
  assert.ok(
    budget <= 70,
    'the hybrid refresh must not exceed the previously tolerated 70-request shape'
  );
});
