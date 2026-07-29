const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const guideFiles = [
  'blog/5-pc-game-deals-worth-buying-2026-07-29.html',
  'blog/best-free-pc-games.html',
  'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html',
  'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html',
  'blog/steam-sale-guide.html'
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('the guides index uses the editorial landing-page system', () => {
  const source = read('blog.html');
  assert.match(source, /<body class="guides-index">/);
  assert.match(source, /class="guides-hero"/);
  assert.match(source, /class="guide-feature"/);
  assert.match(source, /class="guide-card-grid"/);
  assert.match(source, /class="guides-principles"/);
  assert.match(source, /href="guides\.css\?v=1"/);
});

test('every guide article uses the shared responsive reading system', () => {
  for (const file of guideFiles) {
    const source = read(file);
    assert.match(source, /<body class="guide-page">/, file);
    assert.match(source, /href="\.\.\/guides\.css\?v=1"/, file);
    assert.match(source, /src="\.\.\/lib\/guide-page\.js\?v=1"/, file);
    assert.match(source, /<a class="skip-link" href="#guide-content">Skip to guide<\/a>/, file);
    assert.match(source, /<article class="blog-content/, file);
  }
});

test('the article enhancer builds accessible navigation and reading context', () => {
  const source = read('lib/guide-page.js');
  assert.match(source, /aria-label', 'In this guide'/);
  assert.match(source, /guide-reading-time/);
  assert.match(source, /guide-progress/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /prefers-reduced-motion/);
});

test('the guide system keeps current URLs and avoids em dashes', () => {
  const index = read('blog.html');
  for (const file of guideFiles) {
    assert.match(index, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const sources = [
    read('blog.html'),
    read('guides.css'),
    read('lib/guide-page.js'),
    ...guideFiles.map(read)
  ];
  const prohibitedDash = new RegExp(['\\u2014', '&m' + 'dash;', '&#82' + '12;'].join('|'));
  assert.doesNotMatch(sources.join('\n'), prohibitedDash);
});
