const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredSource = [
  'index.html', 'methodology.html', 'app.js', 'style.css', 'manifest.json',
  'deals.json', 'enriched-deals.json', 'config/editorial-config.js',
  'lib/deal-normalizer.js', 'lib/deal-score.js', 'lib/deal-filters.js', 'public/og.png'
];
const requiredBuild = ['dist/server/index.js', 'dist/static/index.html', 'dist/static/app.js', 'dist/static/deals.json'];

const failures = [];
for (const file of [...requiredSource, ...requiredBuild]) {
  const target = path.join(root, file);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) failures.push(file);
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

if (failures.length) {
  console.error(`Verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Verified ${requiredSource.length} source assets, ${requiredBuild.length} build assets, JSON data, and homepage wiring.`);
