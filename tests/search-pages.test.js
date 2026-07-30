const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildDealDataset } = require('../lib/deal-dataset.js');
const {
  PAGE_DEFINITIONS,
  buildSearchPages,
  selectLandingDeals
} = require('../scripts/build-search-pages.js');

const fixtures = [
  { title: 'Great Co-op', storeID: '1', storeName: 'Steam', salePrice: 8, userRating: 91, reviewCount: 8000, discount: 60, dealScore: 84, eligible: true, tags: ['Online Co-op'], genres: ['Indie'] },
  { title: 'Multiplayer Only', storeID: '1', storeName: 'Steam', salePrice: 7, userRating: 90, reviewCount: 9000, discount: 70, dealScore: 82, eligible: true, tags: ['Multiplayer'], genres: ['Action'] },
  { title: 'Weak Deep Cut', storeID: '1', storeName: 'Steam', salePrice: 2, userRating: 55, reviewCount: 150, discount: 90, dealScore: 50, eligible: false, tags: [], genres: [] },
  { title: 'Small Favorite', storeID: '15', storeName: 'Fanatical', salePrice: 4, userRating: 92, reviewCount: 1200, discount: 75, dealScore: 86, eligible: true, tags: ['Indie'], genres: ['Indie'] }
];

function generatedFixture(index) {
  return {
    key: `steam:${index}`,
    steamAppID: String(index),
    title: `Co-op Indie Pick ${index}`,
    storeID: '1',
    storeName: 'Steam',
    salePrice: 4 + (index % 5),
    normalPrice: 29.99,
    userRating: 90 + (index % 5),
    reviewCount: 500 + index * 40,
    discount: 75,
    dealScore: 90 - index,
    eligible: true,
    tags: ['Online Co-op', 'Indie'],
    genres: ['Indie'],
    isIndie: true,
    releaseDate: '2026-06-01',
    dealID: `deal-${index}`,
    recommendation: `${90 + (index % 5)}% positive from ${500 + index * 40} reviews, backed by a 75% discount.`
  };
}

test('shared dataset merges enrichment and deduplicates normalized games', () => {
  const base = {
    stores: { 1: { name: 'Steam', icon: '' } },
    deals: [
      {
        title: 'Good Game',
        salePrice: '9.99',
        normalPrice: '39.99',
        savings: '75',
        storeID: '1',
        dealID: 'deal-a',
        steamAppID: '123',
        steamRatingPercent: '92',
        steamRatingCount: '4000',
        dealRating: '9.2'
      },
      {
        title: 'Good Game Deluxe Edition',
        salePrice: '10.99',
        normalPrice: '39.99',
        savings: '72',
        storeID: '1',
        dealID: 'deal-b',
        steamAppID: '123',
        steamRatingPercent: '92',
        steamRatingCount: '4000',
        dealRating: '8.8'
      }
    ]
  };
  const enriched = {
    games: [{
      dealID: 'deal-a',
      steamAppID: '123',
      rawg: { genres: ['Indie'], tags: ['Online Co-op'], source: 'steam' }
    }]
  };

  const result = buildDealDataset(base, enriched);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].genres, ['Indie']);
  assert.deepEqual(result[0].tags, ['Online Co-op']);
  assert.equal(result[0].storeName, 'Steam');
  assert.equal(typeof result[0].dealScore, 'number');
});

test('co-op pages require an explicit co-op tag', () => {
  assert.deepEqual(selectLandingDeals(fixtures, 'coop').map(item => item.title), ['Great Co-op']);
});

test('Steam under $10 requires Steam, price, and eligibility', () => {
  assert.deepEqual(
    selectLandingDeals(fixtures, 'steam-under-10').map(item => item.title),
    ['Great Co-op', 'Multiplayer Only']
  );
});

test('deep discounts still require quality eligibility', () => {
  assert.equal(selectLandingDeals(fixtures, 'deep').some(item => item.title === 'Weak Deep Cut'), false);
});

test('deep discounts prioritize discount depth instead of duplicating best-deal order', () => {
  const candidates = [
    { ...fixtures[0], title: 'Higher score', discount: 72, dealScore: 95 },
    { ...fixtures[1], title: 'Deeper discount', discount: 90, dealScore: 70 }
  ];
  assert.deepEqual(
    selectLandingDeals(candidates, 'deep').map(item => item.title),
    ['Deeper discount', 'Higher score']
  );
  assert.deepEqual(
    selectLandingDeals(candidates, 'best').map(item => item.title),
    ['Higher score', 'Deeper discount']
  );
});

test('every landing collection applies the default bundle and Early Access exclusions', () => {
  const qualifying = {
    title: 'Qualified Pick',
    storeID: '1',
    storeName: 'Steam',
    salePrice: 6,
    userRating: 91,
    reviewCount: 1200,
    discount: 75,
    dealScore: 82,
    eligible: true,
    tags: ['Online Co-op', 'Indie'],
    genres: ['Indie'],
    isIndie: true,
    releaseDate: '2026-06-01'
  };
  const candidates = [
    qualifying,
    { ...qualifying, title: 'Bundle Pick', isBundle: true },
    { ...qualifying, title: 'Early Access Pick', isEarlyAccess: true },
    { ...qualifying, title: 'Excluded Content Pick', excludedContent: true }
  ];

  // Pinned so the recency window is measured against the fixture, not the clock.
  const now = Date.parse('2026-07-27T18:01:07.921Z');
  for (const pageId of Object.keys(PAGE_DEFINITIONS)) {
    assert.deepEqual(
      selectLandingDeals(candidates, pageId, now).map(item => item.title),
      ['Qualified Pick'],
      `${pageId} did not apply the default content exclusions`
    );
  }
});

test('new arrivals require recency and review support, not just a recent date', () => {
  const now = Date.parse('2026-07-27T18:01:07.921Z');
  const fresh = {
    title: 'Recent Hit',
    storeID: '1',
    storeName: 'Steam',
    salePrice: 24,
    userRating: 88,
    reviewCount: 900,
    discount: 30,
    dealScore: 78,
    eligible: true,
    genres: ['Action'],
    tags: [],
    releaseDate: '2026-06-01'
  };

  const cases = [
    [fresh, true, 'a recent, well-reviewed release qualifies'],
    [{ ...fresh, releaseDate: '2024-01-01' }, false, 'an older release is not a new arrival'],
    [{ ...fresh, reviewCount: 120 }, false, 'a thin review count is rejected'],
    [{ ...fresh, userRating: 62 }, false, 'poor sentiment is rejected'],
    [{ ...fresh, dealScore: 40 }, false, 'a weak Deal Score is rejected'],
    [{ ...fresh, releaseDate: null }, false, 'a missing release date is rejected'],
    [{ ...fresh, releaseDate: '2026-12-01' }, false, 'an unreleased future date is rejected']
  ];

  for (const [deal, expected, label] of cases) {
    assert.equal(
      selectLandingDeals([deal], 'fresh', now).length === 1,
      expected,
      label
    );
  }
});

test('generator writes a crawlable hub and seven unique collection pages', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-search-pages-'));
  const deals = Array.from({ length: 14 }, (_, index) => generatedFixture(index + 1));
  deals[0].dealID = 'abc%2Fdef%3D';
  const result = buildSearchPages({
    outputDir,
    deals,
    snapshot: { updatedAt: '2026-07-27T18:01:07.921Z' }
  });

  assert.equal(result.routes.length, 8);
  assert.deepEqual(Object.keys(result.counts).sort(), Object.keys(PAGE_DEFINITIONS).sort());

  const titles = new Set();
  const descriptions = new Set();
  for (const route of result.generatedRoutes) {
    const source = fs.readFileSync(path.join(outputDir, route), 'utf8');
    for (const token of [
      '<!doctype html>',
      '<link rel="canonical"',
      '<meta name="description"',
      '<h1',
      'Prices checked',
      'How these deals qualify',
      'methodology.html',
      '../lib/analytics.js',
      'application/ld+json'
    ]) {
      assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${route} is missing ${token}`);
    }

    const title = source.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = source.match(/<meta name="description" content="([^"]+)"/i)?.[1];
    assert.ok(title);
    assert.ok(description);
    assert.equal(titles.has(title), false, `${route} has a duplicate title`);
    assert.equal(descriptions.has(description), false, `${route} has a duplicate description`);
    titles.add(title);
    descriptions.add(description);
  }

  const bestPage = fs.readFileSync(
    path.join(outputDir, PAGE_DEFINITIONS.best.route),
    'utf8'
  );
  assert.match(bestPage, /data-track-deal/);
  assert.match(bestPage, /LootRadarAnalytics\.track\('deal_click'/);
  assert.match(bestPage, /Some retailer links may earn LootRadar a commission/);
  assert.match(bestPage, /dealID=abc%2Fdef%3D/);
  assert.doesNotMatch(bestPage, /dealID=abc%252Fdef%253D/);
  assert.match(bestPage, /href="\.\.\/games\/co-op-indie-pick-14-14\.html"/);
});

test('quiet collections remain useful but are marked noindex', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-quiet-pages-'));
  const result = buildSearchPages({
    outputDir,
    deals: [generatedFixture(1)],
    snapshot: { updatedAt: '2026-07-27T18:01:07.921Z' }
  });
  const source = fs.readFileSync(path.join(outputDir, PAGE_DEFINITIONS.coop.route), 'utf8');

  assert.match(source, /<meta name="robots" content="noindex,follow">/);
  assert.match(source, /This collection is unusually quiet in the current snapshot/);
  assert.equal(result.routes.includes(PAGE_DEFINITIONS.coop.route), false);
});

test('the enriched payload ships only what the merge reads', () => {
  // Visitors download enriched-deals.json on every page load. buildDealDataset
  // reads just the metadata and the two join keys, so any extra field here is a
  // duplicate of deals.json being paid for twice.
  const enriched = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'enriched-deals.json'), 'utf8')
  );
  const allowed = new Set(['dealID', 'steamAppID', 'rawg']);
  const offenders = new Set();
  for (const row of enriched.games) {
    for (const key of Object.keys(row)) if (!allowed.has(key)) offenders.add(key);
  }
  assert.deepEqual([...offenders], [], 'enriched rows must not repeat deal fields');

  // Top-level keys are still needed by the alert snapshot validator.
  for (const key of ['updatedAt', 'coverage', 'stores', 'games']) {
    assert.ok(key in enriched, `enriched payload is missing ${key}`);
  }

  const bytesPerRow = fs.statSync(path.join(__dirname, '..', 'enriched-deals.json')).size /
    enriched.games.length;
  assert.ok(bytesPerRow < 700, `enriched payload is ${Math.round(bytesPerRow)} bytes per deal`);
});

test('the recommendations page joins deals with metadata instead of assuming fat rows', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'recommendations.js'), 'utf8');
  assert.match(source, /fetch\('deals\.json/, 'listings must come from deals.json');
  assert.match(source, /metaByDeal|metaByApp/, 'metadata must be joined by key');
  assert.doesNotMatch(
    source,
    /deals\s*=\s*enriched\.games\.map/,
    'enriched rows are metadata only and cannot stand in for deals'
  );
});
