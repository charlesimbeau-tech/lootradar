'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DEFAULT_FILTERS, filterDeals, sortDeals } = require('../lib/deal-filters.js');
const {
  CARD_LIMIT,
  buildHomeFallback,
  replaceRegion,
  snapshotLabel
} = require('../scripts/build-home-fallback.js');

const root = path.resolve(__dirname, '..');

function fixture(index) {
  return {
    key: `steam:${index}`,
    dealID: `deal-${index}`,
    steamAppID: String(1000 + index),
    title: `Fallback Pick ${index}`,
    storeID: '1',
    storeName: 'Steam',
    salePrice: 5 + (index % 4),
    normalPrice: 39.99,
    userRating: 92,
    reviewCount: 4000 + index * 25,
    discount: 75,
    dealScore: 90 - index,
    eligible: true,
    genres: ['Action'],
    tags: ['Singleplayer'],
    image: 'https://example.test/cover.jpg',
    recommendation: `92% positive across ${4000 + index * 25} reviews, at 75% off.`,
    scoreBreakdown: { components: { priceValue: 80 } }
  };
}

function scaffold() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-home-'));
  const indexPath = path.join(dir, 'index.html');
  fs.writeFileSync(indexPath, [
    '<dt id="statQualified"><!--LR:qualified:start-->—<!--LR:qualified:end--></dt>',
    '<dt id="statStores"><!--LR:stores:start-->—<!--LR:stores:end--></dt>',
    '<aside id="heroPick"><!--LR:hero:start--><div class="hero-pick-skeleton"></div><!--LR:hero:end--></aside>',
    '<span id="lastUpdated"><!--LR:updated:start-->Pulling in the newest prices&hellip;<!--LR:updated:end--></span>',
    '<span id="resultCount"><!--LR:count:start--><!--LR:count:end--></span>',
    '<div class="deal-grid" id="deals"><!--LR:deals:start--><!--LR:deals:end--></div>'
  ].join('\n'));

  const base = {
    updatedAt: '2026-07-31T06:13:00.000Z',
    stores: { 1: { name: 'Steam' }, 15: { name: 'Fanatical' } },
    deals: []
  };
  return { dir, indexPath, base };
}

test('bakes the default homepage view into index.html', () => {
  const { indexPath, base } = scaffold();
  const deals = Array.from({ length: 40 }, (unused, index) => fixture(index));
  const result = buildHomeFallback({ base, deals, indexPath });

  const html = fs.readFileSync(indexPath, 'utf8');
  assert.equal(result.cards, CARD_LIMIT);
  assert.equal((html.match(/class="deal-card"/g) || []).length, CARD_LIMIT);
  assert.match(html, /Fallback Pick 0/);
  // Intl emits a narrow no-break space before AM/PM, so match any whitespace.
  assert.match(html, /Prices checked Jul 31, 2:13\sAM EDT/);
  assert.match(html, /<!--LR:stores:start-->2<!--LR:stores:end-->/);

  // The default view drops anything under the recommended-quality floor, so the
  // reported count is the filtered total rather than the raw fixture count.
  const expectedVisible = filterDeals(deals, DEFAULT_FILTERS).length;
  assert.ok(expectedVisible > CARD_LIMIT && expectedVisible < deals.length);
  assert.equal(result.visible, expectedVisible);
  assert.match(html, new RegExp(`<!--LR:count:start-->${expectedVisible} deals<!--LR:count:end-->`));
});

test('static cards carry a working retailer link and no dead controls', () => {
  const { indexPath, base } = scaffold();
  buildHomeFallback({ base, deals: [fixture(0)], indexPath });

  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /href="https:\/\/www\.cheapshark\.com\/redirect\?dealID=deal-0"/);
  assert.match(html, /rel="noopener noreferrer sponsored"/);
  // Buttons need JavaScript to do anything; the fallback must not ship any.
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /data-details=/);
  assert.doesNotMatch(html, /data-watch=/);
  // The title and cover link to the permanent game page instead.
  assert.match(html, /<a class="card-title" href="games\/fallback-pick-0-1000\.html">/);
});

test('a deal without a game page renders inert instead of linking nowhere', () => {
  const { indexPath, base } = scaffold();
  // No steamAppID means no generated page, and too few reviews to earn one.
  const orphan = { ...fixture(0), steamAppID: '', reviewCount: 150 };
  buildHomeFallback({ base, deals: [orphan], indexPath });

  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /<span class="card-title">Fallback Pick 0<\/span>/);
  assert.match(html, /<div class="card-image">/);
  assert.doesNotMatch(html, /href="games\//);
});

test('the baked grid matches what the browser renders on first paint', () => {
  const { indexPath, base } = scaffold();
  const deals = Array.from({ length: 30 }, (unused, index) => fixture(index));
  buildHomeFallback({ base, deals, indexPath });

  const expected = sortDeals(filterDeals(deals, DEFAULT_FILTERS), DEFAULT_FILTERS.sort)
    .slice(0, CARD_LIMIT)
    .map(deal => deal.title);

  const html = fs.readFileSync(indexPath, 'utf8');
  const rendered = [...html.matchAll(/class="card-title"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(rendered, expected);
});

test('rebuilding replaces the previous bake instead of stacking it', () => {
  const { indexPath, base } = scaffold();
  const deals = Array.from({ length: 30 }, (unused, index) => fixture(index));
  buildHomeFallback({ base, deals, indexPath });
  const first = fs.readFileSync(indexPath, 'utf8');
  buildHomeFallback({ base, deals, indexPath });
  const second = fs.readFileSync(indexPath, 'utf8');

  assert.equal(first, second);
  assert.equal((second.match(/class="deal-card"/g) || []).length, CARD_LIMIT);
});

test('deal titles and store names are escaped', () => {
  const { indexPath, base } = scaffold();
  const hostile = {
    ...fixture(0),
    title: '<img src=x onerror=alert(1)>',
    storeName: '"><script>alert(1)</script>',
    dealID: 'javascript:alert(1)'
  };
  buildHomeFallback({ base, deals: [hostile], indexPath });

  const html = fs.readFileSync(indexPath, 'utf8');
  // The payloads survive as inert text; what must not appear is a real tag.
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  // An unusable deal id is dropped rather than written into the href.
  assert.match(html, /dealID=" target="_blank"/);
});

test('a missing marker fails loudly rather than silently skipping the bake', () => {
  assert.throws(
    () => replaceRegion('<div id="deals"></div>', 'deals', '<article></article>'),
    /missing the deals fallback markers/
  );
});

test('an unreadable snapshot time degrades to a neutral label', () => {
  assert.equal(snapshotLabel('not a date'), 'Saved price snapshot');
  assert.equal(snapshotLabel(undefined), 'Saved price snapshot');
});

test('the shipped index.html keeps its fallback markers and baked content', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const name of ['deals', 'hero', 'updated', 'qualified', 'stores', 'count']) {
    assert.match(html, new RegExp(`<!--LR:${name}:start-->`), `${name} start marker is missing`);
    assert.match(html, new RegExp(`<!--LR:${name}:end-->`), `${name} end marker is missing`);
  }
  assert.ok(
    (html.match(/class="deal-card"/g) || []).length > 0,
    'index.html shipped without a prerendered grid; run build-home-fallback.js'
  );
  // The skeleton must start hidden so a reader without JavaScript is not shown
  // a permanent loading animation above real content.
  assert.match(html, /id="loading"[^>]*\shidden/);
  assert.match(html, /<noscript>/);
});

test('app.js keeps the prerendered grid on the first load', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /loadDeals\(\{ keepPrerendered: true \}\)/);
  assert.match(app, /if \(!prerendered\) \$\('#deals'\)\.innerHTML = ''/);
});

test('the hero pick obeys the same content rules as the grid', () => {
  const { indexPath, base } = scaffold();
  // A multi-pack outscores everything but must not become the pick of the day.
  const bundle = {
    ...fixture(0),
    key: 'steam:9999',
    title: 'Everything Bundle',
    dealScore: 99,
    isBundle: true,
    steamAppID: ''
  };
  const deals = [bundle, ...Array.from({ length: 5 }, (unused, i) => fixture(i))];
  buildHomeFallback({ base, deals, indexPath });

  const html = fs.readFileSync(indexPath, 'utf8');
  const hero = html.slice(html.indexOf('<!--LR:hero:start-->'), html.indexOf('<!--LR:hero:end-->'));
  assert.doesNotMatch(hero, /Everything Bundle/);
  assert.match(hero, /Fallback Pick 0/);
  // And it must not leak into the grid either.
  assert.doesNotMatch(html, /class="card-title"[^>]*>Everything Bundle/);
});

test('app.js picks the hero from the filtered set, not raw eligibility', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /sortDeals\(filterDeals\(state\.allDeals, DEFAULT_FILTERS\), 'recommended'\)\[0\]/);
  assert.doesNotMatch(app, /state\.allDeals\.filter\(deal => deal\.eligible\), 'recommended'/);
});
