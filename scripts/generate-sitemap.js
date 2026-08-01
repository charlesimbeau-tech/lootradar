'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PAGE_DEFINITIONS } = require('./build-search-pages.js');
const { loadWeeklyIssues, weeklyGuideRelativePath } = require('../lib/weekly-guide.js');
const { gamePageRoute } = require('../lib/game-pages.js');

const root = path.resolve(__dirname, '..');
const SITE_ORIGIN = 'https://thelootradar.com';
const EDITORIAL_LASTMOD = '2026-07-29';

const STATIC_EDITORIAL_PATHS = Object.freeze([
  '/',
  '/games.html',
  '/recommendations.html',
  '/about.html',
  '/methodology.html',
  '/blog.html',
  '/privacy.html',
  '/terms.html',
  '/blog/are-90-percent-discounts-good.html',
  '/blog/best-free-pc-games.html',
  '/blog/cheapest-steam-games.html',
  '/blog/game-price-comparison.html',
  '/blog/how-to-get-free-games.html',
  '/blog/indie-games-under-five.html',
  '/blog/steam-sale-guide.html'
]);

function editorialEntries(baseDir = root, editorialLastmod = EDITORIAL_LASTMOD) {
  const lastmod = dateOnly(editorialLastmod, 'Editorial lastmod');
  const weekly = loadWeeklyIssues(baseDir).map(issue => ({
    path: `/${weeklyGuideRelativePath(issue)}`,
    lastmod: issue.publishedDate
  }));
  return [
    ...STATIC_EDITORIAL_PATHS.map(urlPath => ({ path: urlPath, lastmod })),
    ...weekly
  ];
}

const EDITORIAL_PATHS = Object.freeze(editorialEntries().map(entry => entry.path));

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
  const editorial = options.editorialEntries || editorialEntries(
    options.baseDir || root,
    editorialLastmod
  );
  const entries = [
    ...editorial.map(entry => ({
      path: entry.path,
      lastmod: dateOnly(entry.lastmod, `Lastmod for ${entry.path}`)
    })),
    // A path may carry its own lastmod. Game pages do, because most of them do
    // not change on a given refresh and saying otherwise teaches Google to
    // ignore the field. Collection pages fall back to the snapshot date, which
    // is honest: their prices really do move every time.
    ...dealPaths.map(entry => (typeof entry === 'string'
      ? { path: entry, lastmod: snapshotLastmod }
      : { path: entry.path, lastmod: dateOnly(entry.lastmod || snapshotLastmod, `Lastmod for ${entry.path}`) }))
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

function indexableGamePaths(baseDir = root) {
  const gamesDir = path.join(baseDir, 'games');
  if (!fs.existsSync(gamesDir)) throw new Error('Missing generated games directory.');
  const files = fs.readdirSync(gamesDir).filter(file => file.endsWith('.html')).sort();
  if (!files.includes('index.html')) throw new Error('Missing generated game hub: games/index.html');
  return files.filter(file => {
    const source = fs.readFileSync(path.join(gamesDir, file), 'utf8');
    if (/<meta\s+name="robots"\s+content="noindex,follow">/i.test(source)) return false;
    const canonical = `${SITE_ORIGIN}/games/${file}`;
    if (!source.includes(`rel="canonical" href="${canonical}"`)) {
      throw new Error(`Generated game page has the wrong canonical: games/${file}`);
    }
    return true;
  }).map(file => `/games/${file}`);
}

// The archive records when each page's rendered content last changed, which is
// far less often than the three-hourly refresh. Pages missing an entry, and the
// hub, fall back to the snapshot date.
function gamePageLastmods(baseDir = root) {
  const archivePath = path.join(baseDir, 'game-pages-archive.json');
  if (!fs.existsSync(archivePath)) return new Map();
  let archive;
  try {
    archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  } catch {
    return new Map();
  }
  const byRoute = new Map();
  for (const entry of Object.values(archive?.games || {})) {
    const route = gamePageRoute(entry);
    if (route && entry.contentChangedAt) byRoute.set(`/games/${route}`, entry.contentChangedAt);
  }
  return byRoute;
}

function generateSitemap(options = {}) {
  const base = options.base || JSON.parse(
    fs.readFileSync(path.join(root, 'deals.json'), 'utf8')
  );
  const xml = createSitemap({
    origin: options.origin,
    editorialLastmod: options.editorialLastmod,
    editorialEntries: options.editorialEntries,
    baseDir: options.baseDir || root,
    snapshotUpdatedAt: options.snapshotUpdatedAt || base.updatedAt,
    dealPaths: options.dealPaths || (() => {
      const baseDir = options.baseDir || root;
      const lastmods = gamePageLastmods(baseDir);
      return [
        ...indexableDealPaths(baseDir),
        ...indexableGamePaths(baseDir).map(urlPath => (
          lastmods.has(urlPath) ? { path: urlPath, lastmod: lastmods.get(urlPath) } : urlPath
        ))
      ];
    })()
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
  STATIC_EDITORIAL_PATHS,
  createSitemap,
  editorialEntries,
  generateSitemap,
  indexableDealPaths,
  indexableGamePaths
};
