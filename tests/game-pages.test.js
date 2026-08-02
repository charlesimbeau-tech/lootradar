const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  GAME_PAGE_LIMIT,
  gamePageRoute,
  selectGamePageDeals
} = require('../lib/game-pages.js');
const { buildGamePages } = require('../scripts/build-game-pages.js');
const { renderGamePage } = require('../scripts/templates/game-page.js');

const qualifiedDeal = {
  key: 'steam:632470',
  title: 'Disco Elysium: The Final Cut',
  steamAppID: '632470',
  storeID: '1',
  storeName: 'Steam',
  salePrice: 8.88,
  normalPrice: 39.99,
  discount: 78,
  dealID: 'deal-632470',
  thumb: 'https://example.com/disco.jpg',
  backgroundImage: 'https://example.com/disco-wide.jpg',
  userRating: 92,
  reviewCount: 57109,
  criticScore: 89,
  dealScore: 94,
  eligible: true,
  excludedContent: false,
  isBundle: false,
  isEarlyAccess: false,
  genres: ['RPG', 'Indie'],
  tags: ['Story Rich']
};

test('creates readable stable routes with Steam IDs', () => {
  assert.equal(
    gamePageRoute(qualifiedDeal),
    'disco-elysium-the-final-cut-632470.html'
  );
  assert.equal(gamePageRoute({ title: 'Missing ID' }), '');
  assert.equal(gamePageRoute({ steamAppID: '12' }), '');
});

test('keeps only high-confidence indexable games', () => {
  const selected = selectGamePageDeals([
    qualifiedDeal,
    { ...qualifiedDeal, key: 'steam:2', title: 'Bundle', steamAppID: '2', isBundle: true },
    { ...qualifiedDeal, key: 'steam:3', title: 'Thin Reviews', steamAppID: '3', reviewCount: 20 },
    { ...qualifiedDeal, key: 'steam:6', title: 'Thin Metadata', steamAppID: '6', genres: [] },
    { ...qualifiedDeal, key: 'steam:4', title: 'Weak Rating', steamAppID: '4', userRating: 72 },
    { ...qualifiedDeal, key: 'steam:5', title: 'Weak Score', steamAppID: '5', dealScore: 61 },
    { ...qualifiedDeal, key: 'title:no-id', title: 'No Steam ID', steamAppID: '' }
  ]);

  assert.deepEqual(selected.map(deal => deal.title), ['Disco Elysium: The Final Cut']);
  // The quality thresholds above decide what deserves a page. The limit is only
  // a runaway guard, and holding it near the old 24 threw away hundreds of
  // long-tail pages that had already cleared the bar.
  assert.ok(
    GAME_PAGE_LIMIT >= 100,
    `GAME_PAGE_LIMIT of ${GAME_PAGE_LIMIT} rations pages that already qualify`
  );
});

test('sorts candidates by Deal Score and review confidence before applying the limit', () => {
  const selected = selectGamePageDeals([
    { ...qualifiedDeal, key: 'steam:10', title: 'Lower Score', steamAppID: '10', dealScore: 80 },
    { ...qualifiedDeal, key: 'steam:11', title: 'Higher Score', steamAppID: '11', dealScore: 91, reviewCount: 2000 },
    { ...qualifiedDeal, key: 'steam:12', title: 'Higher Score More Reviews', steamAppID: '12', dealScore: 91, reviewCount: 9000 }
  ], 2);

  assert.deepEqual(
    selected.map(deal => deal.title),
    ['Higher Score More Reviews', 'Higher Score']
  );
});

test('renders a unique evidence-based game price page', () => {
  const source = renderGamePage(qualifiedDeal, { updatedAt: '2026-07-29T18:00:00Z' });
  for (const token of [
    '<h1>Disco Elysium: The Final Cut PC deal and price check</h1>',
    'rel="canonical" href="https://thelootradar.com/games/disco-elysium-the-final-cut-632470.html"',
    'application/ld+json', 'AggregateRating', 'Offer', 'Why it made the cut',
    'LootRadar is funded by advertising', '../lib/analytics.js',
    'data-track-surface="game_price_page"'
  ]) assert.ok(source.includes(token), `page is missing ${token}`);
  assert.doesNotMatch(source, /all-time low/i);
  assert.doesNotMatch(source, /\u2014/);
});

test('derives factual recommendation copy on game pages instead of trusting supplied copy', () => {
  const generated = renderGamePage(qualifiedDeal, { updatedAt: '2026-07-29T18:00:00Z' });
  assert.match(generated, /<p>92% positive \u00b7 57\.1K reviews \u00b7 78% off<\/p>/);

  const supplied = renderGamePage({
    ...qualifiedDeal,
    historicalLow: 8.88,
    recommendation: 'Stale recommendation copy'
  }, { updatedAt: '2026-07-29T18:00:00Z' });
  assert.match(supplied, /<p>92% positive \u00b7 57\.1K reviews \u00b7 Recorded low<\/p>/);
  assert.doesNotMatch(supplied, /Stale recommendation copy/);

  for (const source of [generated, supplied]) {
    assert.doesNotMatch(
      source,
      /markedly happier|worth trusting|take the price seriously|Deal Score of \d+/i
    );
  }
});

test('generator writes the game hub and one page per selected game', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-game-pages-'));
  const second = { ...qualifiedDeal, key: 'steam:1234', title: 'A Second Great Game', steamAppID: '1234', dealID: 'deal-1234' };
  const result = buildGamePages({
    outputDir,
    deals: [qualifiedDeal, second],
    snapshot: { updatedAt: '2026-07-29T18:00:00Z' }
  });
  assert.deepEqual(result.routes, ['index.html', gamePageRoute(second), gamePageRoute(qualifiedDeal)]);
  const hub = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(hub, /PC game deals with the evidence attached/);
  assert.ok(hub.includes(gamePageRoute(qualifiedDeal)));
  assert.equal(fs.existsSync(path.join(outputDir, gamePageRoute(second))), true);
});

test('generator preserves recorded-low recommendation evidence through the archive merge', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-game-low-'));
  const archivePath = path.join(outputDir, 'archive.json');
  const historicalLowDeal = {
    ...qualifiedDeal,
    salePrice: 8.88,
    historicalLow: 8.88,
    recommendation: '92% positive \u00b7 57.1K reviews \u00b7 Recorded low'
  };

  const result = buildGamePages({
    outputDir,
    archivePath,
    deals: [historicalLowDeal],
    snapshot: { updatedAt: '2026-08-01T00:00:00Z' }
  });

  const html = fs.readFileSync(path.join(outputDir, gamePageRoute(historicalLowDeal)), 'utf8');
  assert.match(html, /<p>92% positive \u00b7 57\.1K reviews \u00b7 Recorded low<\/p>/);
  assert.equal(result.archive.games[historicalLowDeal.key].historicalLow, 8.88);
  assert.equal(result.archive.games[historicalLowDeal.key].recommendation, undefined);
});

test('no generated game page is reachable only from the sitemap', () => {
  // Related links used to take the top four by Deal Score, which pointed every
  // page in a genre at the same four destinations: 273 of 370 pages ended up
  // with zero inbound internal links and a handful collected hundreds. A page
  // only the sitemap knows about gets crawled rarely and ranks poorly, which
  // defeats the point of publishing one page per game.
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lootradar-orphans-'));
  const genres = [['RPG'], ['Action'], ['Strategy'], ['Sports'], ['Indie', 'RPG']];
  const deals = Array.from({ length: 40 }, (unused, index) => ({
    ...qualifiedDeal,
    key: `steam:${9000 + index}`,
    steamAppID: String(9000 + index),
    dealID: `deal-${9000 + index}`,
    title: `Linkable Game ${index}`,
    dealScore: 94 - (index % 20),
    genres: genres[index % genres.length]
  }));

  const result = buildGamePages({
    outputDir,
    deals,
    snapshot: { updatedAt: '2026-07-31T18:00:00Z' }
  });

  const routes = result.routes.filter(route => route !== 'index.html');
  const inbound = Object.fromEntries(routes.map(route => [route, 0]));
  for (const source of result.routes) {
    const html = fs.readFileSync(path.join(outputDir, source), 'utf8');
    for (const route of routes) {
      if (source === route) continue;
      if (html.includes(`"${route}"`)) inbound[route] += 1;
    }
  }

  const orphans = routes.filter(route => inbound[route] === 0);
  assert.deepEqual(orphans, [], `these pages have no inbound internal link: ${orphans.join(', ')}`);

  // Spread matters as much as coverage. One page hoovering up every link is the
  // failure mode this replaced, so no page may hold more than half of them.
  const counts = routes.map(route => inbound[route]);
  assert.ok(
    Math.max(...counts) <= routes.length / 2,
    `links are concentrated: one page holds ${Math.max(...counts)} of ${routes.length}`
  );
});

module.exports = { qualifiedDeal };

test('game page titles and headings target how people actually search', () => {
  const source = renderGamePage(qualifiedDeal, { updatedAt: '2026-07-29T18:00:00Z' });
  const title = (source.match(/<title>([^<]*)<\/title>/) || [])[1] || '';

  // The game name has to lead, and the query term has to survive truncation.
  assert.ok(title.startsWith(qualifiedDeal.title), `title does not lead with the game: ${title}`);
  assert.match(title, /price:/, 'the title should carry the term people search');
  assert.doesNotMatch(title, /\| LootRadar/, 'the brand suffix spends characters Google appends anyway');

  // Question-shaped headings that name the game can win featured snippets and
  // stop hundreds of pages sharing one generic outline.
  for (const heading of [
    `Is ${qualifiedDeal.title} worth buying at this price?`,
    `Before you buy ${qualifiedDeal.title}`,
    `How current is this ${qualifiedDeal.title} price?`
  ]) {
    assert.ok(source.includes(heading), `missing heading: ${heading}`);
  }
});
