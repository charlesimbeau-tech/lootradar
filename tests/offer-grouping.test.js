const test = require('node:test');
const assert = require('node:assert/strict');

const { groupOffersByGame } = require('../scripts/fetch-deals.js');
const { normalizeDeal } = require('../lib/deal-normalizer.js');

function offer(overrides = {}) {
  return {
    title: 'Cyberpunk 2077',
    steamAppID: '1091500',
    storeID: '1',
    dealID: 'deal-steam',
    salePrice: '17.99',
    normalPrice: '59.99',
    savings: '70.0',
    ...overrides
  };
}

test('one entry per game, with the other stores kept alongside', () => {
  // Collapsing to a single listing discarded the comparison the site exists to
  // make: three stores sell this and the snapshot remembered one.
  const grouped = groupOffersByGame([
    offer(),
    offer({ storeID: '7', dealID: 'deal-gog', salePrice: '59.99', savings: '0' }),
    offer({ storeID: '11', dealID: 'deal-humble', salePrice: '59.99', savings: '0' })
  ]);

  const entries = Object.values(grouped);
  assert.equal(entries.length, 1, 'the game should appear once');
  assert.equal(entries[0].dealID, 'deal-steam');
  assert.equal(entries[0].alternates.length, 2);
  assert.deepEqual(entries[0].alternates.map(a => a.storeID).sort(), ['11', '7']);
});

test('the cheapest offer is featured, not the biggest percentage', () => {
  // Stores publish different normal prices, so the deepest discount is not
  // reliably the lowest price. Featuring on savings could put a costlier
  // listing in front of a reader on a price comparison site.
  const grouped = groupOffersByGame([
    offer({ storeID: '1', dealID: 'deep-cut', salePrice: '12.00', normalPrice: '60.00', savings: '80.0' }),
    offer({ storeID: '7', dealID: 'actually-cheaper', salePrice: '9.00', normalPrice: '30.00', savings: '70.0' })
  ]);

  const entry = Object.values(grouped)[0];
  assert.equal(entry.dealID, 'actually-cheaper');
  assert.equal(entry.salePrice, '9.00');
});

test('listings are grouped by Steam app id, not by exact title text', () => {
  const grouped = groupOffersByGame([
    offer({ title: 'Cyberpunk 2077', dealID: 'a', salePrice: '20.00' }),
    offer({ title: 'Cyberpunk 2077 ', storeID: '7', dealID: 'b', salePrice: '18.00' })
  ]);
  assert.equal(Object.keys(grouped).length, 1, 'a stray space should not split a game in two');
  assert.equal(Object.values(grouped)[0].dealID, 'b');
});

test('a game without a Steam id still groups on its title', () => {
  const grouped = groupOffersByGame([
    offer({ steamAppID: null, title: 'Storefront Exclusive', dealID: 'x', salePrice: '5.00' }),
    offer({ steamAppID: null, title: 'Storefront Exclusive', storeID: '7', dealID: 'y', salePrice: '4.00' })
  ]);
  assert.equal(Object.keys(grouped).length, 1);
  assert.equal(Object.values(grouped)[0].dealID, 'y');
});

test('the same store is not listed twice as an alternative', () => {
  const grouped = groupOffersByGame([
    offer({ dealID: 'steam-cheap', salePrice: '10.00' }),
    offer({ dealID: 'steam-dearer', salePrice: '15.00' }),
    offer({ storeID: '7', dealID: 'gog', salePrice: '12.00' })
  ]);
  const entry = Object.values(grouped)[0];
  assert.equal(entry.dealID, 'steam-cheap');
  assert.deepEqual(entry.alternates.map(a => a.dealID), ['gog']);
});

test('alternates are capped so the committed snapshot stays small', () => {
  const offers = [offer({ dealID: 'best', salePrice: '1.00' })];
  for (let i = 0; i < 12; i += 1) {
    offers.push(offer({ storeID: String(20 + i), dealID: `alt-${i}`, salePrice: String(10 + i) }));
  }
  const entry = Object.values(groupOffersByGame(offers, 6))[0];
  assert.equal(entry.alternates.length, 6);
});

test('normalization carries alternates through with store names and prices', () => {
  const stores = { 1: { name: 'Steam' }, 7: { name: 'GOG' } };
  const normalized = normalizeDeal({
    ...offer(),
    alternates: [{ storeID: '7', dealID: 'deal-gog', salePrice: '59.99', normalPrice: '59.99', savings: '0' }]
  }, stores);

  assert.equal(normalized.alternates.length, 1);
  assert.equal(normalized.alternates[0].storeName, 'GOG');
  assert.equal(normalized.alternates[0].salePrice, 59.99);
});

test('a deal with no alternates normalizes to an empty list, not undefined', () => {
  const normalized = normalizeDeal(offer(), { 1: { name: 'Steam' } });
  assert.deepEqual(normalized.alternates, []);
});
