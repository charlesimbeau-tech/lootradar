const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  loadCurrentWeeklyIssue,
  loadWeeklyIssues,
  weeklyGuideRelativePath
} = require('../lib/weekly-guide.js');

const root = path.resolve(__dirname, '..');
const evergreenGuideFiles = [
];
const weeklyGuideFiles = loadWeeklyIssues(root).map(weeklyGuideRelativePath);
const guideFiles = [...weeklyGuideFiles, ...evergreenGuideFiles];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('the weekly picks hub uses the editorial landing-page system', () => {
  const source = read('blog.html');
  assert.match(source, /<body class="guides-index">/);
  assert.match(source, /class="guides-hero"/);
  assert.match(source, /class="guide-feature"/);
  // The evergreen guide grid was removed with the guides themselves. What is
  // left is the weekly shortlist feature, so the index must still surface an
  // issue rather than being an empty shell.
  assert.match(source, /href="blog\/5-pc-game-deals-worth-buying-/);
  assert.doesNotMatch(source, /class="guide-card-grid"/);
  assert.match(source, /class="guides-principles"/);
  assert.match(source, /href="guides\.css\?v=2"/);
  assert.match(source, /<title>Weekly PC game picks \| LootRadar<\/title>/);
  assert.match(source, /LootRadar’s weekly PC game picks\./);
  assert.match(source, /Five current PC game deals\./);
  assert.match(source, /How we choose the five/);
  assert.doesNotMatch(source, /buying guides|free games|Current roundup|three-minute shortlist/i);
});

test('every guide article uses the shared responsive reading system', () => {
  for (const file of guideFiles) {
    const source = read(file);
    assert.match(source, /<body class="guide-page">/, file);
    assert.match(source, /href="\.\.\/guides\.css\?v=[12]"/, file);
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

test('the filled guide button keeps a readable dark label', () => {
  const index = read('blog.html');
  const guideStyles = read('guides.css');
  const globalStyles = read('style.css');

  assert.match(globalStyles, /body:not\(\.home-page\) main a\s*\{[^}]*color:\s*var\(--mint\)/);
  assert.match(index, /class="button button-primary"[^>]*>See this week's picks<\/a>/);
  assert.match(
    guideStyles,
    /\.guides-index \.guides-hero-actions \.button-primary\s*\{[^}]*color:\s*#0a0d0c/
  );
});

test('the guide system keeps current URLs and avoids em dashes', () => {
  const index = read('blog.html');
  const currentWeekly = weeklyGuideRelativePath(loadCurrentWeeklyIssue(root));
  for (const file of [...evergreenGuideFiles, currentWeekly]) {
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
