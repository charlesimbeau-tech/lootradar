const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  normalizeProfile,
  normalizeWatchlist,
  mergeProfiles,
  mergeWatchlists,
  applyFeedbackRows
} = require('../lib/account-data.js');

test('normalizes legacy local records without discarding fields', () => {
  const profile = normalizeProfile({ budget: 20, genres: ['RPG'] }, '2026-07-27T12:00:00.000Z');
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.budget, 20);
  assert.deepEqual(profile.genres, ['RPG']);
  assert.equal(profile.updatedAt, '2026-07-27T12:00:00.000Z');
});

test('newer profile values win while feedback maps are unioned', () => {
  const local = { schemaVersion: 1, budget: 15, updatedAt: '2026-07-27T12:00:00Z', likes: { a: '2026-07-27T12:00:00Z' }, dislikes: {} };
  const remote = { schemaVersion: 1, budget: 30, updatedAt: '2026-07-27T11:00:00Z', likes: {}, dislikes: { b: '2026-07-27T11:00:00Z' } };
  const merged = mergeProfiles(local, remote);
  assert.equal(merged.budget, 15);
  assert.deepEqual(Object.keys(merged.likes), ['a']);
  assert.deepEqual(Object.keys(merged.dislikes), ['b']);
});

test('most recent direct feedback action wins', () => {
  const merged = mergeProfiles(
    { updatedAt: '2026-07-27T12:00:00Z', likes: { a: '2026-07-27T12:00:00Z' }, dislikes: {} },
    { updatedAt: '2026-07-27T11:00:00Z', likes: {}, dislikes: { a: '2026-07-27T13:00:00Z' } }
  );
  assert.equal(merged.likes.a, undefined);
  assert.equal(merged.dislikes.a, '2026-07-27T13:00:00Z');
});

test('watchlists union games and keep the most recently edited target', () => {
  const local = { portal: { key: 'portal', title: 'Portal', targetPrice: 3, updatedAt: '2026-07-27T13:00:00Z' } };
  const remote = [
    { game_key: 'portal', title: 'Portal', target_price: 5, updated_at: '2026-07-27T12:00:00Z' },
    {
      game_key: 'hades',
      title: 'Hades',
      target_price: 10,
      last_known_price: 12.49,
      last_known_store: ' Steam ',
      updated_at: '2026-07-27T12:00:00Z'
    }
  ];
  const merged = mergeWatchlists(local, remote);
  assert.equal(merged.portal.targetPrice, 3);
  assert.equal(merged.hades.targetPrice, 10);
  assert.equal(merged.hades.lastKnownPrice, 12.49);
  assert.equal(merged.hades.lastKnownStore, 'Steam');
});

test('legacy boolean feedback uses the profile timestamp and input data is cloned', () => {
  const input = {
    updatedAt: '2026-07-27T14:00:00Z',
    genres: ['RPG'],
    likes: { portal: true, ignored: false },
    dislikes: {}
  };
  const profile = normalizeProfile(input, '2026-07-27T15:00:00Z');

  assert.equal(profile.likes.portal, '2026-07-27T14:00:00Z');
  assert.equal(profile.likes.ignored, undefined);
  profile.genres.push('Indie');
  profile.likes.hades = '2026-07-27T15:00:00Z';
  assert.deepEqual(input.genres, ['RPG']);
  assert.equal(input.likes.hades, undefined);
});

test('feedback rows apply only valid actions and newest direct action wins', () => {
  const profile = applyFeedbackRows({
    updatedAt: '2026-07-27T12:00:00Z',
    likes: { portal: true },
    dislikes: {}
  }, [
    { item_id: 'portal', action: 'dislike', updated_at: '2026-07-27T13:00:00Z' },
    { item_id: 'hades', action: 'like', updated_at: '2026-07-27T12:30:00Z' },
    { item_id: 'hades', action: 'dislike', updated_at: '2026-07-27T12:15:00Z' },
    { item_id: 'ignored', action: 'skip', updated_at: '2026-07-27T14:00:00Z' }
  ]);

  assert.equal(profile.likes.portal, undefined);
  assert.equal(profile.dislikes.portal, '2026-07-27T13:00:00Z');
  assert.equal(profile.likes.hades, '2026-07-27T12:30:00Z');
  assert.equal(profile.dislikes.hades, undefined);
  assert.equal(profile.likes.ignored, undefined);
  assert.equal(profile.dislikes.ignored, undefined);
});

test('watchlist normalization rejects invalid target prices and clones valid entries', () => {
  const input = {
    portal: { title: 'Portal', targetPrice: '3.50' },
    negative: { title: 'Nope', targetPrice: -1 },
    infinite: { title: 'Nope', targetPrice: Infinity },
    invalid: { title: 'Nope', targetPrice: 'not-a-price' }
  };
  const normalized = normalizeWatchlist(input, '2026-07-27T12:00:00Z');

  assert.deepEqual(Object.keys(normalized), ['portal']);
  assert.deepEqual(normalized.portal, {
    key: 'portal',
    title: 'Portal',
    targetPrice: 3.5,
    lastKnownPrice: null,
    lastKnownStore: null,
    addedAt: '2026-07-27T12:00:00Z',
    updatedAt: '2026-07-27T12:00:00Z'
  });
  normalized.portal.title = 'Changed';
  assert.equal(input.portal.title, 'Portal');
});

test('normalizes camel-case price context and clears invalid optional values', () => {
  const normalized = normalizeWatchlist({
    portal: {
      title: 'Portal',
      targetPrice: 3,
      lastKnownPrice: '2.49',
      lastKnownStore: '  GOG  '
    },
    hades: {
      title: 'Hades',
      targetPrice: 10,
      lastKnownPrice: -1,
      lastKnownStore: '   '
    },
    celeste: {
      title: 'Celeste',
      targetPrice: 5,
      lastKnownPrice: Infinity,
      lastKnownStore: null
    }
  }, '2026-07-27T12:00:00Z');

  assert.equal(normalized.portal.lastKnownPrice, 2.49);
  assert.equal(normalized.portal.lastKnownStore, 'GOG');
  assert.equal(normalized.hades.lastKnownPrice, null);
  assert.equal(normalized.hades.lastKnownStore, null);
  assert.equal(normalized.celeste.lastKnownPrice, null);
  assert.equal(normalized.celeste.lastKnownStore, null);
});

test('publishes the complete account data API as a browser global', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'account-data.js'), 'utf8');
  const context = {};
  vm.runInNewContext(source, context);

  assert.deepEqual(
    Object.keys(context.LootRadarAccountData).sort(),
    ['applyFeedbackRows', 'mergeProfiles', 'mergeWatchlists', 'normalizeProfile', 'normalizeWatchlist']
  );
});
