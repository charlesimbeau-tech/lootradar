const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  formatDate,
  loadCurrentWeeklyIssue,
  loadWeeklyIssues,
  weeklyGuideRelativePath
} = require('../lib/weekly-guide.js');

const root = path.resolve(__dirname, '..');
const weeklyIssues = loadWeeklyIssues(root);
const weeklyFiles = weeklyIssues.map(weeklyGuideRelativePath);
const PUBLIC_HTML = [
  'index.html',
  'games.html',
  'recommendations.html',
  'login.html',
  'account.html',
  'unsubscribe.html',
  'about.html',
  'methodology.html',
  'blog.html',
  'privacy.html',
  'terms.html',
  ...weeklyFiles,
  'blog/are-90-percent-discounts-good.html',
  'blog/best-free-pc-games.html',
  'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html',
  'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html',
  'blog/steam-sale-guide.html',
  'deals/index.html',
  'deals/best-pc-game-deals.html',
  'deals/steam-deals-under-10.html',
  'deals/co-op-game-deals.html',
  'deals/indie-game-deals.html',
  'deals/deep-discounts.html',
  'deals/hidden-gems.html'
];

const INTERFACE_SCRIPTS = [
  'app.js',
  'recommendations.js',
  'login.js',
  'account.js',
  'unsubscribe.js',
  'lib/auth-controller.js',
  'lib/auth-nav.js'
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function decodeEntities(value) {
  return value
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function extract(source, expression, file, field) {
  const match = source.match(expression);
  assert.ok(match, `${file} is missing ${field}`);
  return decodeEntities(match[1]);
}

test('public copy avoids stale and unsupported marketing claims', () => {
  const rules = [
    [/\bupdated (?:daily|weekly)\b/i, 'unsupported update cadence'],
    [/\b(?:15|30)\+\s+(?:authorized\s+)?(?:PC game\s+)?(?:retailers|stores)\b/i, 'hard-coded store count'],
    [/\breal[- ]time\b/i, 'real-time claim'],
    [/\bnever pay full price again\b/i, 'absolute savings claim'],
    [/\bexpert guides?\b/i, 'generic expertise claim'],
    [/\bthe LootRadar team\b/i, 'unsupported team claim'],
    [/\bwe(?:’|')ve done the digging\b/i, 'formulaic authority claim'],
    [/\bhere(?:’|')s a secret\b/i, 'formulaic hook'],
    [/\bmost of them are garbage\b/i, 'hostile generalization'],
    [/\bevery deal\. every store\b/i, 'absolute slogan']
  ];

  const violations = [];
  for (const file of [...PUBLIC_HTML, ...INTERFACE_SCRIPTS]) {
    const source = read(file);
    for (const [pattern, label] of rules) {
      if (pattern.test(source)) violations.push(`${file}: ${label}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('known machine-like interface strings are removed', () => {
  const source = INTERFACE_SCRIPTS.map(read).join('\n');
  const phrases = [
    'The strongest mix of game quality, price value, and review confidence.',
    'Proven games with real review confidence for less than a lunch.',
    'All qualified deals',
    'No cheaper current store was returned for this listing.',
    "Selected ' + profile.genres.length + ' genre(s).",
    'Like a few games and this section will learn your taste.',
    'Guest mode (local only)'
  ];
  const violations = phrases.filter(phrase => source.includes(phrase));
  assert.deepEqual(violations, []);
});

test('every public page has unique title and description metadata', () => {
  const titles = new Map();
  const descriptions = new Map();

  for (const file of PUBLIC_HTML) {
    const source = read(file);
    const title = extract(source, /<title>([\s\S]*?)<\/title>/i, file, 'a title');
    const description = extract(
      source,
      /<meta\s+name="description"\s+content="([^"]+)"/i,
      file,
      'a meta description'
    );
    const canonical = extract(
      source,
      /<link\s+rel="canonical"\s+href="([^"]+)"/i,
      file,
      'a canonical URL'
    );
    assert.ok(title.length >= 20 && title.length <= 70, `${file} title length is ${title.length}`);
    assert.ok(
      description.length >= 70 && description.length <= 170,
      `${file} description length is ${description.length}`
    );
    assert.match(canonical, /^https:\/\/thelootradar\.com\//, `${file} canonical is off-site`);
    assert.equal(titles.has(title), false, `${file} duplicates the title from ${titles.get(title)}`);
    assert.equal(
      descriptions.has(description),
      false,
      `${file} duplicates the description from ${descriptions.get(description)}`
    );
    titles.set(title, file);
    descriptions.set(description, file);
  }
});

test('private utility pages are useful without entering the search index', () => {
  for (const file of ['login.html', 'account.html', 'unsubscribe.html']) {
    const source = read(file);
    assert.match(source, /<meta\s+name="robots"\s+content="noindex,follow"/i, `${file} should be noindex`);
  }
});

test('web app metadata uses the approved product language', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.short_name, 'LootRadar');
  assert.match(manifest.name, /^LootRadar\b/);
  assert.match(manifest.description, /quality/i);
  assert.match(manifest.description, /value/i);
  assert.match(manifest.description, /review confidence/i);
});

test('trust pages state the real refresh cadence and pricing source', () => {
  for (const file of ['about.html', 'methodology.html']) {
    const source = read(file);
    assert.match(source, /every three hours/i, `${file} is missing the refresh cadence`);
    assert.match(source, /CheapShark/i, `${file} is missing the pricing source`);
  }
});

test('pricing provider stays in fine print instead of promotional copy', () => {
  for (const file of PUBLIC_HTML) {
    const source = read(file);
    const description = extract(
      source,
      /<meta\s+name="description"\s+content="([^"]+)"/i,
      file,
      'a meta description'
    );
    assert.doesNotMatch(description, /CheapShark/i, `${file} promotes the pricing provider in metadata`);
  }

  const primaryCopy = [
    read('index.html').match(/<main[\s\S]*?<\/main>/i)?.[0] || '',
    read('games.html').replace(/<script[\s\S]*?<\/script>/gi, '').match(/<main[\s\S]*?<\/main>/i)?.[0] || '',
    read('account.html').replace(/<script[\s\S]*?<\/script>/gi, '').match(/<main[\s\S]*?<\/main>/i)?.[0] || ''
  ].join('\n');
  assert.doesNotMatch(primaryCopy, />[^<]*CheapShark/i);
  assert.doesNotMatch(
    read('app.js'),
    /(?:Checking|provides|returned|Deal Rating)[^'"`\n]*CheapShark|CheapShark[^'"`\n]*(?:provides|returned|Deal Rating)/i
  );

  for (const file of [
    'deals/index.html',
    'deals/best-pc-game-deals.html',
    'deals/steam-deals-under-10.html',
    'deals/co-op-game-deals.html',
    'deals/indie-game-deals.html',
    'deals/deep-discounts.html',
    'deals/hidden-gems.html'
  ]) {
    const source = read(file);
    const visibleText = source
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');
    assert.equal(
      (visibleText.match(/CheapShark/gi) || []).length,
      1,
      `${file} should name the provider only in its footer disclosure`
    );
  }

  for (const file of ['about.html', 'methodology.html']) {
    assert.doesNotMatch(
      read(file),
      /<a[^>]+href="https:\/\/www\.cheapshark\.com\/?"[^>]*>/i,
      `${file} should not advertise the provider with an outbound link`
    );
  }
});

test('weekly promotion has current evidence and a truthful account path', () => {
  const current = loadCurrentWeeklyIssue(root);
  const weeklyFile = weeklyGuideRelativePath(current);
  const roundup = read(weeklyFile);
  const homepage = read('index.html');
  const blog = read('blog.html');

  assert.match(roundup, new RegExp(`Prices checked ${formatDate(current.publishedDate)}`, 'i'));
  assert.equal((roundup.match(/class="weekly-pick"/g) || []).length, 5);
  assert.equal((roundup.match(/data-track-deal data-track-store/g) || []).length, 5);
  assert.match(roundup, /price and availability can change/i);
  assert.match(blog, new RegExp(weeklyFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(homepage, /sync your watchlist and ranking preferences across devices/i);
  assert.match(homepage, /login\.html\?next=\//);
  assert.doesNotMatch(homepage, /email alerts|price-drop alerts/i);
});

test('the site does not claim affiliate income it does not have', () => {
  // Every outbound link is a CheapShark redirect and no affiliate tag exists in
  // the codebase, so copy promising LootRadar a commission would be untrue.
  const claims = [
    /retailer links may earn LootRadar a commission/i,
    /eligible links may earn LootRadar a commission/i,
    /may earn LootRadar a commission/i
  ];
  const violations = [];
  for (const file of [...PUBLIC_HTML, ...INTERFACE_SCRIPTS]) {
    const source = read(file);
    for (const claim of claims) {
      if (claim.test(source)) violations.push(`${file}: ${claim}`);
    }
  }
  assert.deepEqual(violations, []);

  // And the trust pages must say plainly where the money does come from.
  for (const file of ['about.html', 'terms.html']) {
    assert.match(read(file), /no affiliate relationship|holds no affiliate/i, `${file}`);
  }
});
