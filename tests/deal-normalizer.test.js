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
