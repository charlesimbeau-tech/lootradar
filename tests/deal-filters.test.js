const test = require('node:test');
const assert = require('node:assert/strict');
const { filterDeals, readFiltersFromUrl, filtersToSearchParams } = require('../lib/deal-filters.js');

const fixtures = [
  {
    slug: 'excellent-game', title: 'Excellent Game', storeID: '1', storeName: 'Steam',
    salePrice: 8, discount: 60, userRating: 92, reviewCount: 5000, dealScore: 86,
    eligible: true, excludedContent: false, isEarlyAccess: false, isBundle: false,
    isIndie: true, isMultiplayer: false, genres: ['Action'], tags: []
  },
  {
    slug: 'tiny-dlc', title: 'Tiny DLC', storeID: '1', storeName: 'Steam',
    salePrice: 1, discount: 90, userRating: 95, reviewCount: 500, dealScore: 20,
    eligible: false, excludedContent: true, isEarlyAccess: false, isBundle: false,
    genres: ['Action'], tags: []
  }
];

test('default quality mode rejects DLC and low-confidence games', () => {
  const visible = filterDeals(fixtures, { collection: 'all' });
  assert.deepEqual(visible.map(game => game.slug), ['excellent-game']);
});

test('relaxed quality controls can reveal excluded items only when explicitly included', () => {
  const visible = filterDeals(fixtures, {
    collection: 'all', quality: 'all', includeDlc: true, minRating: 0, minReviews: 0
  });
  assert.equal(visible.length, 2);
});

test('URL filters round-trip', () => {
  const parsed = readFiltersFromUrl('https://thelootradar.com/?q=hades&maxPrice=20&includeDlc=1&collection=all');
  assert.equal(parsed.q, 'hades');
  assert.equal(parsed.maxPrice, 20);
  assert.equal(parsed.includeDlc, true);
  const params = filtersToSearchParams(parsed);
  assert.equal(params.get('q'), 'hades');
  assert.equal(params.get('includeDlc'), '1');
});
