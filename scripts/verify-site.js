const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredSource = [
  'index.html', 'methodology.html', 'app.js', 'style.css', 'manifest.json',
  'deals.json', 'enriched-deals.json', 'config/editorial-config.js',
  'lib/deal-normalizer.js', 'lib/deal-score.js', 'lib/deal-filters.js',
  'lib/cheapshark-client.js', 'lib/deal-snapshot-validator.js',
  'lib/analytics.js', 'lib/safe-redirect.js', 'public/og.png'
];
const requiredBuild = [
  'dist/server/index.js', 'dist/static/index.html', 'dist/static/app.js',
  'dist/static/deals.json', 'dist/static/lib/cheapshark-client.js',
  'dist/static/lib/analytics.js', 'dist/static/lib/safe-redirect.js',
  'dist/static/recommendations.js'
];
const editorialPages = [
  'index.html', 'games.html', 'recommendations.html', 'login.html',
  'about.html', 'methodology.html', 'blog.html', 'privacy.html', 'terms.html',
  'blog/best-free-pc-games.html', 'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html', 'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html', 'blog/steam-sale-guide.html'
];
const adsensePublisher = 'ca-pub-3845680227675655';
const adsensePages = [
  'index.html', 'games.html', 'recommendations.html', 'methodology.html',
  'about.html', 'blog.html',
  'blog/best-free-pc-games.html', 'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html', 'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html', 'blog/steam-sale-guide.html'
];
const analyticsPages = ['games.html', 'recommendations.html', 'login.html'];
const goatCounterPages = editorialPages;

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

for (const file of ['manifest.json', 'deals.json', 'enriched-deals.json']) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    failures.push(`${file} (${error.message})`);
  }
}

const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const token of ['lib/deal-score.js', 'id="deals"', 'id="dealDialog"', 'methodology.html']) {
  if (!homepage.includes(token)) failures.push(`index.html missing ${token}`);
}
if (!homepage.includes('lib/cheapshark-client.js')) {
  failures.push('index.html missing the shared CheapShark client');
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

if (failures.length) {
  console.error(`Verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Verified ${requiredSource.length} source assets, ${requiredBuild.length} build assets, JSON data, and homepage wiring.`);
