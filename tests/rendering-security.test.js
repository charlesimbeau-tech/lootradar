const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const games = fs.readFileSync(path.join(root, 'games.html'), 'utf8');
const recommendations = fs.readFileSync(path.join(root, 'recommendations.js'), 'utf8');
const navigationPages = [
  'index.html',
  'games.html',
  'recommendations.html',
  'methodology.html',
  'about.html',
  'blog.html',
  'privacy.html',
  'terms.html',
  'login.html',
  ...fs.readdirSync(path.join(root, 'blog'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join('blog', name))
];

test('external deal fields are escaped before HTML rendering', () => {
  assert.match(app, /function safeDealID\(value\)/);
  assert.doesNotMatch(app, /dealID=\$\{(?:deal|item)\.dealID\}/);
  assert.match(games, /function escapeHtml\(value\)/);
  assert.match(games, /function safeImageUrl\(value/);
  assert.doesNotMatch(games, /onclick="showGameDetail/);
  assert.doesNotMatch(games, /\$\{g\.external\}/);
  assert.doesNotMatch(games, /\$\{d\.title\}/);
  assert.match(games, /function safeDealID\(value\)/);
  assert.match(games, /dealID=\$\{safeDealID\(d\.dealID\)\}/);

  assert.match(recommendations, /function safeImageUrl\(value\)/);
  assert.match(recommendations, /function safeDealID\(value\)/);
  assert.match(recommendations, /escapeAttribute\(game\.title/);
  assert.match(recommendations, /escapeAttribute\(why\)/);
  assert.match(recommendations, /escapeAttribute\(gameLink\(game\)\)/);
});

test('outbound deal links are marked as sponsored', () => {
  assert.doesNotMatch(games, /data-track-deal[^>]*rel="noopener noreferrer"/);
  assert.match(games, /rel="noopener noreferrer sponsored"/);
  assert.match(recommendations, /rel="noopener noreferrer sponsored"/);
});

test('repeated navigation uses the current product vocabulary', () => {
  for (const relativePath of navigationPages) {
    const html = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const nav = html.match(/<div[^>]*class="nav-links"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(nav, `${relativePath} has primary navigation`);
    assert.doesNotMatch(nav[1], />Home</, `${relativePath} uses Deals`);
    assert.doesNotMatch(nav[1], />Recommendations</, `${relativePath} uses For you`);
    assert.doesNotMatch(nav[1], />Login</, `${relativePath} uses Sign in`);
    assert.doesNotMatch(nav[1], />Blog</, `${relativePath} uses Guides`);
  }
});

test('the weekly shortlist links to permanent deal collections', () => {
  // The evergreen guides that used to carry these links were removed. The
  // weekly issue is the remaining editorial page, and it still has to route
  // readers into the collections rather than dead-ending.
  const weekly = fs.readdirSync(path.join(root, 'blog'))
    .filter(file => file.startsWith('5-pc-game-deals-worth-buying-'));
  assert.ok(weekly.length > 0, 'expected at least one weekly issue');

  for (const file of weekly) {
    const source = fs.readFileSync(path.join(root, 'blog', file), 'utf8');
    for (const link of ['../deals/index.html', '../deals/best-pc-game-deals.html']) {
      assert.ok(source.includes(`href="${link}"`), `blog/${file} should link to ${link}`);
    }
  }
});

test('monetized content uses a plain, consistent affiliate disclosure', () => {
  const pages = navigationPages.filter((file) => file !== 'login.html');
  // The site holds no affiliate deals; the disclosure must not imply otherwise.
  const disclosure = 'LootRadar is funded by advertising.';
  for (const relativePath of pages) {
    const html = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(html, new RegExp(disclosure.replace(/\./g, '\\.')), relativePath);
  }
});
