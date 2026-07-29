const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EDITORIAL_PATHS,
  createSitemap,
  editorialEntries,
  indexableGamePaths
} = require('../scripts/generate-sitemap.js');
const { loadCurrentWeeklyIssue, weeklyGuideRelativePath } = require('../lib/weekly-guide.js');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');

test('creates canonical sitemap entries without advisory priority fields', () => {
  const xml = createSitemap({
    origin: 'https://thelootradar.com',
    editorialLastmod: '2026-07-27',
    snapshotUpdatedAt: '2026-07-27T18:00:00Z',
    dealPaths: ['/deals/index.html', '/deals/best-pc-game-deals.html']
  });

  assert.equal((xml.match(/<url>/g) || []).length, EDITORIAL_PATHS.length + 2);
  assert.match(xml, /<loc>https:\/\/thelootradar\.com\/<\/loc>/);
  const weeklyPath = weeklyGuideRelativePath(loadCurrentWeeklyIssue(root));
  assert.match(xml, new RegExp(`<loc>https:\\/\\/thelootradar\\.com\\/${weeklyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/loc>`));
  assert.match(xml, /<loc>https:\/\/thelootradar\.com\/deals\/best-pc-game-deals\.html<\/loc>/);
  assert.doesNotMatch(xml, /login\.html/);
  assert.doesNotMatch(xml, /<priority>|<changefreq>/);
});

test('keeps each weekly issue date on its own sitemap entry', () => {
  const entries = editorialEntries(root, '2026-07-27');
  const weekly = loadCurrentWeeklyIssue(root);
  assert.deepEqual(
    entries.find(entry => entry.path === `/${weeklyGuideRelativePath(weekly)}`),
    { path: `/${weeklyGuideRelativePath(weekly)}`, lastmod: weekly.publishedDate }
  );
});

test('uses editorial and snapshot modification dates for their respective pages', () => {
  const xml = createSitemap({
    editorialLastmod: '2026-07-27',
    snapshotUpdatedAt: '2026-08-02T03:15:00Z',
    dealPaths: ['/deals/index.html']
  });

  assert.match(xml, /<loc>https:\/\/thelootradar\.com\/about\.html<\/loc>\s+<lastmod>2026-07-27<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/thelootradar\.com\/deals\/index\.html<\/loc>\s+<lastmod>2026-08-02<\/lastmod>/);
});

test('rejects insecure origins and invalid dates', () => {
  assert.throws(
    () => createSitemap({
      origin: 'http://thelootradar.com',
      editorialLastmod: '2026-07-27',
      snapshotUpdatedAt: '2026-07-27',
      dealPaths: []
    }),
    /must use HTTPS/
  );
  assert.throws(
    () => createSitemap({
      editorialLastmod: 'not-a-date',
      snapshotUpdatedAt: '2026-07-27',
      dealPaths: []
    }),
    /valid date/
  );
});

test('discovers canonical generated game pages for the sitemap', () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-sitemap-games-'));
  const gamesDir = path.join(baseDir, 'games');
  fs.mkdirSync(gamesDir);
  for (const file of ['index.html', 'quality-game-123.html']) {
    fs.writeFileSync(
      path.join(gamesDir, file),
      `<link rel="canonical" href="https://thelootradar.com/games/${file}">`
    );
  }
  assert.deepEqual(indexableGamePaths(baseDir), ['/games/index.html', '/games/quality-game-123.html']);
});
