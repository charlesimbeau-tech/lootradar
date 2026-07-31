const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDeal, normalizeTitle, contentFlags } = require('../lib/deal-normalizer.js');

test('normalizes edition names for cross-store matching', () => {
  assert.equal(normalizeTitle('Control™ Ultimate Edition'), 'control');
  assert.equal(normalizeTitle('Control: Game of the Year'), 'control');
});

test('detects DLC, soundtracks, demos, and currency packs', () => {
  assert.equal(contentFlags('Space Quest - Season Pass', []).excluded, true);
  assert.equal(contentFlags('Space Quest Original Soundtrack', []).types[0], 'soundtrack');
  assert.equal(contentFlags('Space Quest Demo', []).types[0], 'demo');
  assert.equal(contentFlags('Space Quest 5000 Coins', []).types[0], 'currency');
});

test('maps CheapShark and Steam metadata into one stable shape', () => {
  const normalized = normalizeDeal({
    title: 'SteamWorld Dig 2',
    salePrice: '1.19',
    normalPrice: '19.99',
    savings: '94.0',
    storeID: '1',
    steamAppID: '571310',
    steamRatingPercent: '95',
    steamRatingCount: '2973',
    rawg: { genres: ['Action', 'Indie'], tags: ['Singleplayer'], released: '2017-09-22' }
  }, { 1: { name: 'Steam' } });
  assert.equal(normalized.storeName, 'Steam');
  assert.equal(normalized.userRating, 95);
  assert.equal(normalized.isIndie, true);
  assert.equal(normalized.releaseYear, 2017);
});

test('flags multi-edition combo listings as bundles', () => {
  const normalized = normalizeDeal({
    title: 'Resident Evil 7 Gold Edition and Village Gold Edition',
    salePrice: '29.99',
    normalPrice: '79.99'
  });
  assert.equal(normalized.isBundle, true);
});

test('a store package with no resolved app metadata stays a bundle', () => {
  // True multi-packs are store subs: the app lookup returns nothing, so no
  // genres come back and the review count is summed across the contents.
  const normalized = normalizeDeal({
    title: 'Middle-earth: The Shadow Bundle',
    salePrice: '6.99',
    normalPrice: '69.99',
    steamAppID: '648168',
    steamRatingPercent: '90',
    steamRatingCount: '151127'
  });
  assert.equal(normalized.isBundle, true);
});

test('a compilation that resolves to one app is a game, not a bundle', () => {
  // "Collection" in the title is a naming convention, not a multi-pack. A
  // resolved genre list proves a single app answered for the listing.
  const normalized = normalizeDeal({
    title: 'UNCHARTED: Legacy of Thieves Collection',
    salePrice: '19.99',
    normalPrice: '49.99',
    steamAppID: '1659420',
    rawg: { genres: ['Adventure'], tags: ['Singleplayer'] }
  });
  assert.equal(normalized.isBundle, false);
});

test('resolved metadata never turns an ordinary game into a bundle', () => {
  // The genre veto only removes the keyword flag; it cannot add one.
  const plain = normalizeDeal({
    title: 'Hollow Knight',
    salePrice: '7.49',
    normalPrice: '14.99',
    steamAppID: '367520',
    rawg: { genres: ['Indie'], tags: ['Metroidvania'] }
  });
  const unenriched = normalizeDeal({
    title: 'Hollow Knight',
    salePrice: '7.49',
    normalPrice: '14.99',
    steamAppID: '367520'
  });
  assert.equal(plain.isBundle, false);
  assert.equal(unenriched.isBundle, false);
});

test('reconciles unix release timestamps with enrichment release dates', () => {
  // The pricing feed sends unix seconds and uses 0 for unknown; enrichment
  // sends an ISO date. Parsing seconds as milliseconds would date games to 1970.
  const fromFeed = normalizeDeal({ title: 'Feed Only', releaseDate: 1703030400 });
  assert.equal(fromFeed.releaseDate, '2023-12-20');
  assert.equal(fromFeed.releaseYear, 2023);

  assert.equal(normalizeDeal({ title: 'Unknown Date', releaseDate: 0 }).releaseDate, null);
  assert.equal(normalizeDeal({ title: 'No Date' }).releaseDate, null);

  const preferred = normalizeDeal({
    title: 'Both Sources',
    releaseDate: 1703030400,
    rawg: { released: '2026-07-22' }
  });
  assert.equal(preferred.releaseDate, '2026-07-22');
  assert.equal(preferred.releaseYear, 2026);
});
