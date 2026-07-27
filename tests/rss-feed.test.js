const test = require('node:test');
const assert = require('node:assert/strict');
const { createRssFeed } = require('../lib/rss-feed.js');

const options = {
  updatedAt: '2026-07-27T18:00:00Z',
  origin: 'https://thelootradar.com'
};

test('creates escaped RSS with stable LootRadar links and qualified items only', () => {
  const xml = createRssFeed([
    {
      key: 'steam:1',
      title: 'Good & Cheap',
      salePrice: 4.99,
      storeName: 'Steam & Friends',
      dealScore: 82,
      eligible: true,
      recommendation: 'Strong reviews & a useful discount.'
    },
    {
      key: 'steam:2',
      title: 'Excluded',
      salePrice: 1,
      storeName: 'Steam',
      dealScore: 40,
      eligible: false
    }
  ], options);

  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /Good &amp; Cheap/);
  assert.match(xml, /Steam &amp; Friends/);
  assert.match(xml, /Strong reviews &amp; a useful discount\./);
  assert.doesNotMatch(xml, /Excluded/);
  assert.match(xml, /https:\/\/thelootradar\.com\/\?q=Good\+%26\+Cheap&amp;collection=all/);
  assert.match(xml, /urn:lootradar:steam:1:4\.99/);
});

test('sorts by Deal Score without mutating input and caps the feed at 20 items', () => {
  const deals = Array.from({ length: 24 }, (_, index) => ({
    key: `steam:${index}`,
    title: `Game ${index}`,
    salePrice: index + 0.5,
    storeName: 'Steam',
    dealScore: index,
    reviewCount: index * 10,
    eligible: true,
    recommendation: `Reason ${index}.`
  }));
  const originalOrder = deals.map(deal => deal.key);
  const xml = createRssFeed(deals, options);

  assert.equal((xml.match(/<item>/g) || []).length, 20);
  assert.ok(xml.indexOf('Game 23') < xml.indexOf('Game 22'));
  assert.deepEqual(deals.map(deal => deal.key), originalOrder);
});

test('includes price, store, score, recommendation, source note, and snapshot dates', () => {
  const xml = createRssFeed([{
    key: 'steam:free',
    title: 'No-Cost Game',
    salePrice: 0,
    storeName: 'Example Store',
    dealScore: 91.5,
    eligible: true,
    recommendation: 'Well reviewed and currently free.'
  }], options);

  assert.match(xml, /Free at Example Store\./);
  assert.match(xml, /LootRadar Deal Score: 91\.5\/100\./);
  assert.match(xml, /Well reviewed and currently free\./);
  assert.match(xml, /sourced via CheapShark/);
  assert.match(xml, /Snapshot checked 2026-07-27T18:00:00\.000Z\./);
  assert.match(xml, /Mon, 27 Jul 2026 18:00:00 GMT/);
  assert.match(xml, /urn:lootradar:steam:free:0\.00/);
});

test('omits malformed eligible rows instead of emitting unstable items', () => {
  const xml = createRssFeed([
    { key: '', title: 'Missing key', salePrice: 1, dealScore: 80, eligible: true },
    { key: 'x', title: '', salePrice: 1, dealScore: 80, eligible: true },
    { key: 'y', title: 'Bad price', salePrice: 'nope', dealScore: 80, eligible: true },
    { key: 'z', title: 'Bad score', salePrice: 1, dealScore: null, eligible: true }
  ], options);

  assert.doesNotMatch(xml, /<item>/);
});

test('rejects non-HTTPS origins and invalid snapshot timestamps', () => {
  assert.throws(
    () => createRssFeed([], { ...options, origin: 'http://thelootradar.com' }),
    /must use HTTPS/
  );
  assert.throws(
    () => createRssFeed([], { ...options, origin: 'not a url' }),
    /valid HTTPS URL/
  );
  assert.throws(
    () => createRssFeed([], { ...options, updatedAt: 'not a date' }),
    /valid snapshot timestamp/
  );
});
