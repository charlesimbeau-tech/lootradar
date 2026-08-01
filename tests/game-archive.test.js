const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { archiveEntries, emptyArchive, mergeArchive } = require('../lib/game-archive.js');
const { buildGamePages } = require('../scripts/build-game-pages.js');

function deal(index, overrides = {}) {
  return {
    key: `steam:${index}`,
    title: `Archive Game ${index}`,
    steamAppID: String(index),
    storeID: '1',
    storeName: 'Steam',
    salePrice: 9.99,
    normalPrice: 39.99,
    discount: 75,
    dealID: `deal-${index}`,
    userRating: 92,
    reviewCount: 5000,
    dealScore: 90,
    eligible: true,
    excludedContent: false,
    isBundle: false,
    isEarlyAccess: false,
    genres: ['RPG'],
    releaseYear: 2020,
    image: 'https://example.test/art.jpg',
    ...overrides
  };
}

test('a game that stops being discounted keeps its entry and its last price', () => {
  const first = mergeArchive(emptyArchive(), [deal(1), deal(2)], { now: '2026-08-01T00:00:00Z' });
  const second = mergeArchive(first, [deal(1)], { now: '2026-08-02T00:00:00Z' });

  const entries = Object.fromEntries(archiveEntries(second).map(e => [e.key, e]));
  assert.equal(entries['steam:1'].live, true);
  assert.equal(entries['steam:2'].live, false);
  // The price it last carried is what the page will show, so it has to survive.
  assert.equal(entries['steam:2'].salePrice, 9.99);
  assert.equal(entries['steam:2'].lastSeenAt, '2026-08-01T00:00:00.000Z');
});

test('a returning deal goes live again without losing its first-seen date', () => {
  const first = mergeArchive(emptyArchive(), [deal(1)], { now: '2026-08-01T00:00:00Z' });
  const gone = mergeArchive(first, [], { now: '2026-08-02T00:00:00Z' });
  const back = mergeArchive(gone, [deal(1, { salePrice: 4.99 })], { now: '2026-08-03T00:00:00Z' });

  const entry = archiveEntries(back)[0];
  assert.equal(entry.live, true);
  assert.equal(entry.salePrice, 4.99);
  assert.equal(entry.firstSeenAt, '2026-08-01T00:00:00.000Z');
});

test('entries age out after the retention window', () => {
  const first = mergeArchive(emptyArchive(), [deal(1), deal(2)], { now: '2026-01-01T00:00:00Z' });
  const later = mergeArchive(first, [deal(1)], { now: '2026-06-01T00:00:00Z', retentionDays: 90 });

  const keys = archiveEntries(later).map(e => e.key);
  assert.deepEqual(keys, ['steam:1'], 'a page nobody has seen for months should not be kept forever');
});

test('the archive is bounded, and live pages survive the trim', () => {
  const stale = mergeArchive(
    emptyArchive(),
    [deal(1), deal(2), deal(3)],
    { now: '2026-08-01T00:00:00Z' }
  );
  const trimmed = mergeArchive(stale, [deal(4)], { now: '2026-08-02T00:00:00Z', limit: 2 });

  const entries = archiveEntries(trimmed);
  assert.equal(entries.length, 2);
  assert.equal(entries.find(e => e.key === 'steam:4')?.live, true, 'the live deal must never be trimmed');
});

test('a malformed timestamp is dropped rather than kept forever', () => {
  const broken = { version: 1, games: { 'steam:9': { key: 'steam:9', title: 'X', lastSeenAt: 'nonsense' } } };
  const merged = mergeArchive(broken, [], { now: '2026-08-01T00:00:00Z' });
  assert.deepEqual(archiveEntries(merged), []);
});

test('generated pages survive their deal ending, and say so honestly', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-archive-'));
  const archivePath = path.join(outputDir, 'archive.json');
  const route = 'archive-game-2-2.html';

  buildGamePages({
    outputDir,
    archivePath,
    deals: [deal(1), deal(2)],
    snapshot: { updatedAt: '2026-08-01T00:00:00Z' }
  });
  assert.equal(fs.existsSync(path.join(outputDir, route)), true);

  const after = buildGamePages({
    outputDir,
    archivePath,
    deals: [deal(1)],
    snapshot: { updatedAt: '2026-08-02T00:00:00Z' }
  });

  assert.equal(after.live, 1);
  assert.equal(after.archived, 1);
  assert.equal(
    fs.existsSync(path.join(outputDir, route)),
    true,
    'deleting the page would 404 a URL Google may already have indexed'
  );

  const html = fs.readFileSync(path.join(outputDir, route), 'utf8');
  assert.match(html, /Not discounted right now/);
  // A stale price in structured data is a number the store will not honour.
  assert.doesNotMatch(html, /"@type":"Offer"/);
  // The saved deal id is dead, so the redirect would go nowhere.
  assert.doesNotMatch(html, /cheapshark\.com\/redirect/);
  assert.match(html, /store\.steampowered\.com\/app\/2\//);
});

test('archived pages are linked too, not just live ones', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-archive-links-'));
  const archivePath = path.join(outputDir, 'archive.json');
  const all = Array.from({ length: 12 }, (unused, i) => deal(i + 1, { dealScore: 90 - i }));

  buildGamePages({ outputDir, archivePath, deals: all, snapshot: { updatedAt: '2026-08-01T00:00:00Z' } });
  const result = buildGamePages({
    outputDir,
    archivePath,
    deals: all.slice(0, 4),
    snapshot: { updatedAt: '2026-08-02T00:00:00Z' }
  });

  const routes = result.routes.filter(r => r !== 'index.html');
  const inbound = Object.fromEntries(routes.map(r => [r, 0]));
  for (const source of result.routes) {
    const html = fs.readFileSync(path.join(outputDir, source), 'utf8');
    for (const r of routes) {
      if (source === r) continue;
      if (html.includes(`"${r}"`)) inbound[r] += 1;
    }
  }
  const orphans = routes.filter(r => inbound[r] === 0);
  assert.deepEqual(orphans, [], `archived pages left unlinked: ${orphans.join(', ')}`);
});
