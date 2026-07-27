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

test('generator writes a crawlable hub and six unique collection pages', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-search-pages-'));
  const deals = Array.from({ length: 14 }, (_, index) => generatedFixture(index + 1));
  const result = buildSearchPages({
    outputDir,
    deals,
    snapshot: { updatedAt: '2026-07-27T18:01:07.921Z' }
  });

  assert.equal(result.routes.length, 7);
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
