const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateSnapshot
} = require('../lib/deal-snapshot-validator.js');

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

  // The recent pass is additive. Its failure must not, or one flaky sort
  // parameter would take down the whole three-hourly refresh.
  const recentBlock = source.slice(source.indexOf('RECENT_PAGES_PER_STORE > 0'));
  const recentCatch = recentBlock.slice(0, recentBlock.indexOf('console.log'));
  assert.match(recentCatch, /recent pass skipped/, 'the recent pass must warn on failure');
  assert.doesNotMatch(
    recentCatch,
    /failedStores\.push/,
    'the recent pass must not abort the refresh'
  );

  assert.match(source, /sortBy=\$\{sortBy\}/, 'both passes share one query builder');
  assert.match(source, /releaseDate: d\.releaseDate/, 'release dates must survive into the snapshot');
});

test('the workflow declares the recent-pass page budget', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'update-deals.yml'),
    'utf8'
  );
  assert.match(workflow, /RECENT_PAGES_PER_STORE: \d+/);
});
