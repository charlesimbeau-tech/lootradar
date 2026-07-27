const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EDITORIAL_PATHS,
  createSitemap
} = require('../scripts/generate-sitemap.js');

test('creates canonical sitemap entries without advisory priority fields', () => {
  const xml = createSitemap({
    origin: 'https://thelootradar.com',
    editorialLastmod: '2026-07-27',
    snapshotUpdatedAt: '2026-07-27T18:00:00Z',
    dealPaths: ['/deals/index.html', '/deals/best-pc-game-deals.html']
  });

  assert.equal((xml.match(/<url>/g) || []).length, EDITORIAL_PATHS.length + 2);
  assert.match(xml, /<loc>https:\/\/thelootradar\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/thelootradar\.com\/deals\/best-pc-game-deals\.html<\/loc>/);
  assert.doesNotMatch(xml, /login\.html/);
  assert.doesNotMatch(xml, /<priority>|<changefreq>/);
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
