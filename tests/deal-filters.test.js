const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_FILTERS,
  consolidateHomepageFilters,
  effectiveSort,
  filterDeals,
  sortDeals,
  toggleCollection,
  readFiltersFromUrl,
  filtersToSearchParams
} = require('../lib/deal-filters.js');

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

test('best right now is a stricter shortlist than all qualified deals', () => {
  const worthALook = {
    ...fixtures[0],
    slug: 'worth-a-look',
    title: 'Worth a Look',
    dealScore: 74
  };

  assert.deepEqual(
    filterDeals([fixtures[0], worthALook], { collection: 'best' }).map(game => game.slug),
    ['excellent-game']
  );
  assert.deepEqual(
    filterDeals([fixtures[0], worthALook], { collection: 'all' }).map(game => game.slug),
    ['excellent-game', 'worth-a-look']
  );
});

test('free today and five-dollar finds never overlap', () => {
  const free = { ...fixtures[0], slug: 'free', salePrice: 0 };
  const five = { ...fixtures[0], slug: 'five', salePrice: 5 };
  const over = { ...fixtures[0], slug: 'over', salePrice: 5.01 };

  assert.deepEqual(
    filterDeals([free, five, over], { collection: 'free' }).map(game => game.slug),
    ['free']
  );
  assert.deepEqual(
    filterDeals([free, five, over], { collection: 'five' }).map(game => game.slug),
    ['five']
  );
});

test('homepage ordering follows neutral, filtered, and discovery states', () => {
  assert.equal(DEFAULT_FILTERS.collection, 'all');
  assert.equal(effectiveSort(DEFAULT_FILTERS), 'title');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, q: 'portal' }), 'recommended');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, maxPrice: 10 }), 'recommended');
  // Recency is the entry condition for new arrivals, not the ranking. Sorting
  // by release date buried better-reviewed games behind newer weaker ones.
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, collection: 'fresh' }), 'reviewed');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, collection: 'hidden' }), 'recommended');
});

test('clicking the active discovery tab returns to the neutral catalog', () => {
  assert.equal(toggleCollection('all', 'free'), 'free');
  assert.equal(toggleCollection('free', 'free'), 'all');
  assert.equal(toggleCollection('free', 'hidden'), 'hidden');
});

test('alphabetical ordering uses game titles', () => {
  const rows = [{ title: 'Zulu' }, { title: 'alpha' }, { title: 'Beta' }];
  assert.deepEqual(sortDeals(rows, 'title').map(row => row.title), ['alpha', 'Beta', 'Zulu']);
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

test('retired duplicate collection chips become equivalent filter controls', () => {
  assert.deepEqual(
    {
      collection: consolidateHomepageFilters({ collection: 'under10' }).collection,
      maxPrice: consolidateHomepageFilters({ collection: 'under10' }).maxPrice,
      minRating: consolidateHomepageFilters({ collection: 'under10' }).minRating
    },
    { collection: 'all', maxPrice: 10, minRating: 80 }
  );
  assert.equal(consolidateHomepageFilters({ collection: 'deep' }).minDiscount, 70);
  assert.equal(consolidateHomepageFilters({ collection: 'indie' }).genre, 'Indie');
});

test('the new arrivals collection needs recency and review support together', () => {
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  const recent = {
    slug: 'recent-hit', title: 'Recent Hit', storeID: '1', storeName: 'Steam',
    salePrice: 24, discount: 30, userRating: 88, reviewCount: 900, dealScore: 78,
    eligible: true, excludedContent: false, isEarlyAccess: false, isBundle: false,
    genres: ['Action'], tags: [], releaseDate: '2026-06-01'
  };
  const pick = deal => filterDeals([deal], { collection: 'fresh', now }).length === 1;

  assert.equal(pick(recent), true);
  assert.equal(pick({ ...recent, releaseDate: '2023-01-01' }), false);
  assert.equal(pick({ ...recent, reviewCount: 120 }), false);
  assert.equal(pick({ ...recent, userRating: 62 }), false);
  assert.equal(pick({ ...recent, releaseDate: null }), false);
});

test('newest release sorts by date rather than by year alone', () => {
  const games = [
    { slug: 'jan', releaseDate: '2026-01-05', releaseYear: 2026 },
    { slug: 'jul', releaseDate: '2026-07-20', releaseYear: 2026 },
    { slug: 'old', releaseDate: '2019-03-02', releaseYear: 2019 },
    { slug: 'none' }
  ];
  assert.deepEqual(
    sortDeals(games, 'release').map(game => game.slug),
    ['jul', 'jan', 'old', 'none']
  );
});

test('a clock override never leaks into a shareable URL', () => {
  const params = filtersToSearchParams({ collection: 'fresh', now: 1780000000000 });
  assert.equal(params.get('now'), null);
  assert.equal(params.get('collection'), 'fresh');
});
