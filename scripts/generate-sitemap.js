'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PAGE_DEFINITIONS } = require('./build-search-pages.js');

const root = path.resolve(__dirname, '..');
const SITE_ORIGIN = 'https://thelootradar.com';
const EDITORIAL_LASTMOD = '2026-07-29';

const EDITORIAL_PATHS = Object.freeze([
  '/',
  '/games.html',
  '/recommendations.html',
  '/about.html',
  '/methodology.html',
  '/blog.html',
  '/privacy.html',
  '/terms.html',
  '/blog/5-pc-game-deals-worth-buying-2026-07-29.html',
  '/blog/best-free-pc-games.html',
  '/blog/cheapest-steam-games.html',
  '/blog/game-price-comparison.html',
  '/blog/how-to-get-free-games.html',
  '/blog/indie-games-under-five.html',
  '/blog/steam-sale-guide.html'
]);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeOrigin(value) {
  const parsed = new URL(value || SITE_ORIGIN);
  if (parsed.protocol !== 'https:') throw new TypeError('Sitemap origin must use HTTPS.');
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function dateOnly(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new TypeError(`${label} must be a valid date.`);
  }
  return parsed.toISOString().slice(0, 10);
}

function createSitemap(options = {}) {
  const origin = normalizeOrigin(options.origin || SITE_ORIGIN);
  const editorialLastmod = dateOnly(
    options.editorialLastmod || EDITORIAL_LASTMOD,
    'Editorial lastmod'
  );
  const snapshotLastmod = dateOnly(options.snapshotUpdatedAt, 'Snapshot updatedAt');
  const dealPaths = Array.isArray(options.dealPaths) ? options.dealPaths : [];
  const entries = [
    ...EDITORIAL_PATHS.map(urlPath => ({ path: urlPath, lastmod: editorialLastmod })),
    ...dealPaths.map(urlPath => ({ path: urlPath, lastmod: snapshotLastmod }))
  ];
  const seen = new Set();
  const unique = entries.filter(entry => {
    if (!entry.path.startsWith('/') || seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
  const urls = unique.map(entry => [
    '  <url>',
    `    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`,
    `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
    '  </url>'
  ].join('\n')).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    ''
  ].join('\n');
}

function indexableDealPaths(baseDir = root) {
  const dealsDir = path.join(baseDir, 'deals');
  const paths = ['/deals/index.html'];
  for (const definition of Object.values(PAGE_DEFINITIONS)) {
    const file = path.join(dealsDir, definition.route);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing generated deal page: deals/${definition.route}`);
    }
    const source = fs.readFileSync(file, 'utf8');
    if (!/<meta\s+name="robots"\s+content="noindex,follow">/i.test(source)) {
      paths.push(`/deals/${definition.route}`);
    }
  }
  return paths;
}

function generateSitemap(options = {}) {
  const base = options.base || JSON.parse(
    fs.readFileSync(path.join(root, 'deals.json'), 'utf8')
  );
  const xml = createSitemap({
    origin: options.origin,
    editorialLastmod: options.editorialLastmod,
    snapshotUpdatedAt: options.snapshotUpdatedAt || base.updatedAt,
    dealPaths: options.dealPaths || indexableDealPaths(options.baseDir || root)
  });
  const output = path.resolve(options.output || path.join(root, 'sitemap.xml'));
  fs.writeFileSync(output, xml);
  return { output, urlCount: (xml.match(/<url>/g) || []).length };
}

if (require.main === module) {
  const result = generateSitemap();
  console.log(`Generated ${result.urlCount} canonical URLs in ${result.output}.`);
}

module.exports = {
  EDITORIAL_LASTMOD,
  EDITORIAL_PATHS,
  createSitemap,
  generateSitemap,
  indexableDealPaths
};
