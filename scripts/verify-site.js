const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredSource = [
  'index.html', 'methodology.html', 'app.js', 'style.css', 'manifest.json',
  'deals.json', 'enriched-deals.json', 'config/editorial-config.js',
  'lib/deal-normalizer.js', 'lib/deal-score.js', 'lib/deal-filters.js',
  'lib/cheapshark-client.js', 'lib/deal-snapshot-validator.js',
  'lib/analytics.js', 'lib/safe-redirect.js', 'lib/rss-feed.js',
  'feed.xml', 'sitemap.xml', 'public/og.png'
];
const requiredBuild = [
  'dist/server/index.js', 'dist/static/index.html', 'dist/static/app.js',
  'dist/static/deals.json', 'dist/static/lib/cheapshark-client.js',
  'dist/static/lib/analytics.js', 'dist/static/lib/safe-redirect.js',
  'dist/static/lib/rss-feed.js', 'dist/static/recommendations.js',
  'dist/static/feed.xml', 'dist/static/sitemap.xml'
];
const editorialPages = [
  'index.html', 'games.html', 'recommendations.html', 'login.html',
  'about.html', 'methodology.html', 'blog.html', 'privacy.html', 'terms.html',
  'blog/best-free-pc-games.html', 'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html', 'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html', 'blog/steam-sale-guide.html'
];
const adsensePublisher = 'ca-pub-3845680227675655';
const adsenseEditorialPages = [
  'index.html', 'games.html', 'recommendations.html', 'methodology.html',
  'about.html', 'blog.html',
  'blog/best-free-pc-games.html', 'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html', 'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html', 'blog/steam-sale-guide.html'
];
const generatedDealPages = [
  'deals/index.html',
  'deals/best-pc-game-deals.html',
  'deals/steam-deals-under-10.html',
  'deals/co-op-game-deals.html',
  'deals/indie-game-deals.html',
  'deals/deep-discounts.html',
  'deals/hidden-gems.html'
];
const adsensePages = [...adsenseEditorialPages, ...generatedDealPages];
const analyticsPages = [
  'index.html', 'games.html', 'recommendations.html', 'login.html',
  ...generatedDealPages
];
const goatCounterPages = [...editorialPages, ...generatedDealPages];

const failures = [];
for (const file of [...requiredSource, ...requiredBuild]) {
  const target = path.join(root, file);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) failures.push(file);
}

for (const file of editorialPages) {
  for (const base of [root, path.join(root, 'dist', 'static')]) {
    const target = path.join(base, file);
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
      failures.push(path.relative(root, target));
    }
  }
}

for (const file of generatedDealPages) {
  for (const base of [root, path.join(root, 'dist', 'static')]) {
    const target = path.join(base, file);
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
      failures.push(path.relative(root, target));
    }
  }
}

for (const file of ['manifest.json', 'deals.json', 'enriched-deals.json']) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    failures.push(`${file} (${error.message})`);
  }
}

const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const token of ['lib/deal-score.js', 'lib/analytics.js', 'id="deals"', 'id="dealDialog"', 'methodology.html']) {
  if (!homepage.includes(token)) failures.push(`index.html missing ${token}`);
}
if (!homepage.includes('lib/cheapshark-client.js')) {
  failures.push('index.html missing the shared CheapShark client');
}

const homepageScript = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const token of [
  "track('deal_click'", "track('search_used'", "track('watchlist_add'",
  "track('watchlist_remove'", "track('watchlist_open'", "track('watchlist_target_update'"
]) {
  if (!homepageScript.includes(token)) failures.push(`app.js missing ${token}`);
}

const gamesPage = fs.readFileSync(path.join(root, 'games.html'), 'utf8');
for (const token of [
  'lib/cheapshark-client.js', 'lib/analytics.js', 'cacheTtlMs',
  'AbortController', "track('search_used'", "track('deal_click'"
]) {
  if (!gamesPage.includes(token)) failures.push(`games.html missing ${token}`);
}

for (const file of analyticsPages) {
  for (const base of [root, path.join(root, 'dist', 'static')]) {
    const target = path.join(base, file);
    const source = fs.readFileSync(target, 'utf8');
    if (!source.includes('lib/analytics.js')) {
      failures.push(`${path.relative(root, target)} missing the analytics helper`);
    }
  }
}

const recommendationsScript = fs.readFileSync(path.join(root, 'recommendations.js'), 'utf8');
for (const token of ["track('deal_click'", "'recommendation_like'", "'recommendation_skip'"]) {
  if (!recommendationsScript.includes(token)) failures.push(`recommendations.js missing ${token}`);
}

const loginPage = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
for (const token of ['lib/safe-redirect.js', 'LootRadarRedirect.safeRedirect', "track('auth_request'"]) {
  if (!loginPage.includes(token)) failures.push(`login.html missing ${token}`);
}
const builtLoginPage = fs.readFileSync(path.join(root, 'dist', 'static', 'login.html'), 'utf8');
for (const token of ['lib/safe-redirect.js', 'LootRadarRedirect.safeRedirect', "track('auth_request'"]) {
  if (!builtLoginPage.includes(token)) failures.push(`dist/static/login.html missing ${token}`);
}
for (const [label, source] of [['login.html', loginPage], ['dist/static/login.html', builtLoginPage]]) {
  if (!source.includes('name="robots" content="noindex,follow"')) {
    failures.push(`${label} missing noindex,follow`);
  }
  if (!source.includes('rel="canonical" href="https://thelootradar.com/login.html"')) {
    failures.push(`${label} missing the self-canonical`);
  }
}

for (const file of goatCounterPages) {
  for (const base of [root, path.join(root, 'dist', 'static')]) {
    const target = path.join(base, file);
    const source = fs.readFileSync(target, 'utf8');
    if (!source.includes('thelootradar.goatcounter.com/count')) {
      failures.push(`${path.relative(root, target)} missing GoatCounter pageview loader`);
    }
  }
}

for (const file of adsensePages) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes(`name="google-adsense-account" content="${adsensePublisher}"`)) {
    failures.push(`${file} missing AdSense account metadata`);
  }
  if (!source.includes(`adsbygoogle.js?client=${adsensePublisher}`)) {
    failures.push(`${file} missing AdSense loader`);
  }
}

const adsTxt = fs.readFileSync(path.join(root, 'ads.txt'), 'utf8');
if (!adsTxt.includes(`google.com, ${adsensePublisher.replace('ca-', '')}, DIRECT, f08c47fec0942fa0`)) {
  failures.push('ads.txt missing the direct Google AdSense authorization');
}

const sourceFeed = fs.readFileSync(path.join(root, 'feed.xml'), 'utf8');
const builtFeed = fs.readFileSync(path.join(root, 'dist', 'static', 'feed.xml'), 'utf8');
for (const [label, source] of [['feed.xml', sourceFeed], ['dist/static/feed.xml', builtFeed]]) {
  const itemCount = (source.match(/<item>/g) || []).length;
  if (!source.includes('<rss version="2.0"') || itemCount > 20) {
    failures.push(`${label} must be a valid RSS 2.0 feed with at most 20 items`);
  }
  if (source.includes('http://thelootradar.com')) {
    failures.push(`${label} contains a non-HTTPS LootRadar URL`);
  }
}

const indexableDealPages = generatedDealPages.filter(file => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return !source.includes('name="robots" content="noindex,follow"');
});
const indexablePages = [
  ...editorialPages.filter(file => file !== 'login.html'),
  ...indexableDealPages
];
const canonicalUrl = file => file === 'index.html'
  ? 'https://thelootradar.com/'
  : `https://thelootradar.com/${file.replace(/\\/g, '/')}`;

for (const file of indexablePages) {
  for (const base of [root, path.join(root, 'dist', 'static')]) {
    const target = path.join(base, file);
    const source = fs.readFileSync(target, 'utf8');
    if (!source.includes('rel="alternate" type="application/rss+xml"') ||
        !source.includes('href="/feed.xml"')) {
      failures.push(`${path.relative(root, target)} missing RSS autodiscovery`);
    }
    if (!source.includes(`rel="canonical" href="${canonicalUrl(file)}"`)) {
      failures.push(`${path.relative(root, target)} has the wrong canonical URL`);
    }
  }
}

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const builtSitemap = fs.readFileSync(path.join(root, 'dist', 'static', 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]).sort();
const expectedSitemapUrls = indexablePages.map(canonicalUrl).sort();
if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedSitemapUrls)) {
  failures.push(`sitemap.xml URL parity mismatch: expected ${expectedSitemapUrls.length}, found ${sitemapUrls.length}`);
}
if (sitemap.includes('login.html') || sitemap.includes('<priority>') || sitemap.includes('<changefreq>')) {
  failures.push('sitemap.xml contains login or ignored advisory fields');
}
if (builtSitemap !== sitemap) {
  failures.push('dist/static/sitemap.xml does not match the source sitemap');
}

const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
if (!robots.includes('Sitemap: https://thelootradar.com/sitemap.xml')) {
  failures.push('robots.txt is missing the canonical sitemap location');
}

if (failures.length) {
  console.error(`Verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Verified ${requiredSource.length} source assets, ${requiredBuild.length} build assets, ${indexablePages.length} canonical pages, RSS, sitemap parity, JSON data, and homepage wiring.`);
