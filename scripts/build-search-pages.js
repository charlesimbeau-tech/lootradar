'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const { gamePageRoute, selectGamePageDeals } = require('../lib/game-pages.js');
const config = require('../config/editorial-config.js');
const { MIN_INDEXABLE_DEALS, renderLandingPage } = require('./templates/deal-landing.js');

const root = path.resolve(__dirname, '..');

const PAGE_DEFINITIONS = {
  best: {
    id: 'best',
    route: 'best-pc-game-deals.html',
    canonicalPath: '/deals/best-pc-game-deals.html',
    limit: 24,
    shortLabel: 'Best today',
    kicker: 'Best right now',
    title: 'Best PC game deals today | LootRadar',
    description: 'The strongest PC game deals live right now, pulled from current store listings and ranked on how good the game is before how big the discount looks.',
    heading: 'Best PC game deals today',
    lede: 'A short list of games people actually love, at prices that just got interesting.',
    introduction: [
      'The biggest badge on the page is almost never the best deal on the page. This one starts with the latest store listings, runs them through the quality and content checks, and only then ranks what is left standing. What rises to the top are games with real player feedback attached to prices that genuinely moved.',
      'It is a starting point, not an instruction. Genre, mood, and how much time you actually have still matter more than any number we can calculate. Every card tells you the store, the current price, how solid the review evidence is, the Deal Score, and the specific reason this offer climbed.'
    ],
    criteria: 'A listing has to clear the default eligibility rules and score at least 55. That score mixes game quality, price value, discount strength, review confidence, and player interest. Add-ons, soundtracks, demos, currency packs, and anything with thin evidence get filtered out before ranking even starts. What remains is ordered by Deal Score, with review volume breaking the ties.',
    caveat: 'We do the filtering and the scoring. The store decides what you actually pay and whether it is still in stock. Listings can change after the snapshot, or in the time it takes you to click through.',
    cardSummary: 'The best balance of great game, good price, and real review evidence in the latest sweep.',
    relatedGuide: { path: 'blog/game-price-comparison.html', label: 'How to compare PC game prices' }
  },
  'steam-under-10': {
    id: 'steam-under-10',
    route: 'steam-deals-under-10.html',
    canonicalPath: '/deals/steam-deals-under-10.html',
    limit: 24,
    shortLabel: 'Steam under $10',
    kicker: 'Single-digit prices',
    title: 'Steam deals under $10 | LootRadar',
    description: 'Steam storefront games under ten dollars that are actually worth the download, ranked on current price and how much the reviews really prove.',
    heading: 'Steam deals under $10',
    lede: 'Single-digit prices on Steam, minus the bargain-bin shovelware.',
    introduction: [
      'A cheap game you never open is not a bargain, it is clutter. Everything here is a Steam storefront listing at $10 or less in the current snapshot, and every one of them still had to pass the normal quality and content checks. That is what keeps this page from turning into a bin of five-dollar regrets.',
      'The order is Deal Score, not price. A $9 game with thousands of happy players will sit above a $2 game nobody has reviewed, and that is deliberate. Look at the review count next to the rating, read the reason on the card, and let Steam confirm the price before you buy.'
    ],
    criteria: 'To appear here a listing must come from the Steam storefront, cost $10 or less, and pass the default eligibility rules. Whatever qualifies is ranked by Deal Score, which weighs player and critic signals, how strong the price is, how deep the cut goes, review volume, and player interest. DLC, soundtracks, demos, and currency packs are not invited.',
    caveat: 'This page covers the Steam storefront listing in the snapshot. Other sellers may have Steam keys at other prices, and store inventory moves around.',
    cardSummary: 'Steam listings at $10 or less that still cleared the quality bar.',
    relatedGuide: { path: 'blog/cheapest-steam-games.html', label: 'A practical guide to inexpensive Steam games' }
  },
  coop: {
    id: 'coop',
    route: 'co-op-game-deals.html',
    canonicalPath: '/deals/co-op-game-deals.html',
    limit: 24,
    shortLabel: 'Co-op',
    kicker: 'Better with company',
    title: 'Co-op game deals worth sharing | LootRadar',
    description: 'Games explicitly tagged for co-op, filtered for quality first, so the thing you talk a friend into buying is actually good. Current prices and reasons attached.',
    heading: 'Co-op game deals worth sharing',
    lede: 'Games you can drag a friend into, checked for quality before anyone mentions the price.',
    introduction: [
      'Multiplayer is a famously slippery word. It can mean a ranked ladder, a server full of strangers, or a mode that has nothing to do with sitting on a call with your friend for four hours. This page is stricter than that. A game needs an actual online, local, shared-screen, or general co-op tag in the available Steam metadata before it gets in.',
      'After that, the usual rules apply. Real player feedback, enough reviews to trust, and a price worth acting on all push a listing up. What the cards cannot tell you is whether cross-play works, how many players it takes, or whether remote play will hold up on your connection. Check the store page for that.'
    ],
    criteria: 'A listing must pass the default quality and content filters and carry an explicit co-op tag in its metadata. A generic multiplayer tag will not do. Whatever qualifies is ranked by Deal Score, combining quality, price value, discount strength, review confidence, and player interest, which stops a big discount from dragging a poorly supported game onto the list.',
    caveat: 'Co-op classification depends on Steam metadata, and that metadata does not cover every listing. Treat this as a good curated set rather than a complete catalog of every co-op game on sale.',
    cardSummary: 'Properly tagged co-op games that also cleared the normal quality bar.',
    relatedGuide: { path: 'blog/game-price-comparison.html', label: 'How to compare PC game prices' }
  },
  indie: {
    id: 'indie',
    route: 'indie-game-deals.html',
    canonicalPath: '/deals/indie-game-deals.html',
    limit: 24,
    shortLabel: 'Indie',
    kicker: 'Smaller games, strong signals',
    title: 'Indie game deals worth discovering | LootRadar',
    description: 'Independent games with the player reviews to back them up and prices that just dropped. Where the weird, brilliant, unexpectedly enormous stuff lives.',
    heading: 'Indie game deals worth discovering',
    lede: 'Small studios, big ideas, and prices that make the risk basically free.',
    introduction: [
      'Indie is not a quality guarantee and a famous publisher is not a reason to skip a smaller game. Some of the best things anyone has made in the last decade came from teams of three people. This page uses Steam genre and tag metadata to find independent releases, then runs the same review, content, and value checks as everywhere else on the site.',
      'What floats to the top are games with convincing player sentiment and enough reviews to make that sentiment mean something. Price matters, but it cannot carry a listing alone. Each card gives you the rating, the review count, the store, the current price, and the reason it is here, so you can decide whether an unfamiliar name is worth a spot in the backlog.'
    ],
    criteria: 'A listing needs Indie in its genre or tag metadata, has to pass the default quality and content rules, and then gets ranked by Deal Score. That combines game quality, price value, discount strength, review confidence, and player interest. Excluded add-ons and thin-evidence entries stay out no matter how dramatic their percentages look.',
    caveat: 'Steam metadata is incomplete, so some genuinely independent games never get classified for this page. Prices come from the current snapshot and will move.',
    cardSummary: 'Indie-tagged games with real review evidence and a price worth acting on.',
    relatedGuide: { path: 'blog/indie-games-under-five.html', label: 'How to find inexpensive indie games' }
  },
  deep: {
    id: 'deep',
    route: 'deep-discounts.html',
    canonicalPath: '/deals/deep-discounts.html',
    limit: 24,
    shortLabel: 'Deep discounts',
    kicker: 'Big cuts, quality intact',
    title: 'Deep PC game discounts worth a look | LootRadar',
    description: 'Discounts of 70% or more that survived the quality checks. All the drama of a huge price cut, none of the shovelware that usually comes with it.',
    heading: 'Deep discounts that clear the quality bar',
    lede: 'Cuts of 70% and up, where the game is still stronger than the sale badge.',
    introduction: [
      'A 90% badge can make almost anything feel urgent. What it cannot do is improve the game, and it certainly does not prove the original price meant anything. So this page starts at 70% off, and then throws out everything that fails the usual quality and content rules.',
      'That second step is the entire value of the page. After the discount is counted, player sentiment, review volume, and price value can still lift a deal or sink it. Come here when you want a genuinely big sale without switching your brain off, then let genre, edition, and the honest question of whether you will play it make the final call.'
    ],
    criteria: 'Every listing must be at least 70% below its stated normal price, clear the default eligibility checks, and score 65 or higher. That raised floor is deliberate: it stops discount depth from taking over the page. Non-game content and thin-evidence listings are removed before what qualifies is ranked by Deal Score.',
    caveat: 'Normal prices and discount percentages come from store data. A giant percentage is not proof of an all-time low, and we will not call it one without verified history to back it up.',
    cardSummary: 'Cuts of 70% or deeper that also earned a strong Deal Score.',
    relatedGuide: { path: 'blog/game-price-comparison.html', label: 'How to judge a PC game discount' }
  },
  hidden: {
    id: 'hidden',
    route: 'hidden-gems.html',
    canonicalPath: '/deals/hidden-gems.html',
    limit: 24,
    shortLabel: 'Hidden gems',
    kicker: 'Strong reviews, smaller audience',
    title: 'Hidden-gem PC game deals | LootRadar',
    description: 'Games adored by a few thousand people instead of a few million. At least 85% positive, small enough to have missed you, and cheap enough to gamble on.',
    heading: 'Hidden-gem deals with strong player reviews',
    lede: 'Beloved by everyone who played them. Which so far is not very many people.',
    introduction: [
      'Hidden gem usually just means a game the writer happened to enjoy. We gave the phrase an actual job. To land here a listing needs unusually positive player feedback, a review history that is meaningful without being blockbuster-sized, and a Deal Score good enough to survive the normal value and content checks.',
      'The upper review limit keeps the biggest names out. The lower one stops a handful of launch-week ratings from posing as a consensus. It is a discovery tool, not a promise that every game here is obscure or right for you, so use the genre and store details before you add yet another hopeful to the backlog.'
    ],
    criteria: 'A game needs at least 85% positive feedback, between 100 and 4,999 recorded player reviews, a pass on the default eligibility rules, and a Deal Score of 60 or better. Qualifying listings are ranked by Deal Score and then review volume. Those boundaries chase strong, well-supported sentiment instead of producing another list of the most famous games on PC.',
    caveat: 'Review counts and ratings come from the enrichment and listing data available. Missing metadata can keep a good game out, and hidden here means the boundaries of this collection rather than any universal claim about fame.',
    cardSummary: 'At least 85% positive, from a smaller but entirely credible crowd.',
    relatedGuide: { path: 'blog/indie-games-under-five.html', label: 'Finding smaller games on a budget' }
  }
};

const HUB_DEFINITION = {
  id: 'hub',
  route: 'index.html',
  canonicalPath: '/deals/index.html',
  shortLabel: 'All collections',
  kicker: 'Browse with a purpose',
  title: 'Browse quality-first PC game deals | LootRadar',
  description: 'Every LootRadar deal collection in one place, each built from live store listings with its selection rules written out where you can read them.',
  heading: 'Browse quality-first PC game deals',
  lede: 'Permanent collections for finding a good price without treating every big number as advice.',
  introduction: [
    'The homepage is where you search and fiddle with filters. This hub is where the strongest collections live at a permanent address, so you can come back to the same kind of shortlist without rebuilding it from scratch. Pick by budget, by how you play, by how obscure you want to go, or by how deep the cut is.',
      'Every collection starts from the current price snapshot and applies a published set of rules. Listings, prices, review context, and ranking reasons are all in the page before any JavaScript runs, which means a link you send someone works immediately and shows them something specific rather than another vague sale page.'
  ],
  criteria: 'Every collection drops listings that fail the default content and quality rules, and several add stricter boundaries of their own, which each page spells out: price, metadata, rating, review count, discount, or Deal Score. A collection with fewer than 6 matches stays online as a fallback but is marked to stay out of search results until the inventory recovers.',
  caveat: 'The published snapshot refreshes every three hours. A listing can change before the next one lands, or between you clicking a store link and reaching the checkout page.',
  isHub: true
};

function selectLandingDeals(deals, pageId) {
  const selected = deals.filter(deal => {
    if (!deal.eligible || deal.excludedContent || deal.isBundle || deal.isEarlyAccess) {
      return false;
    }
    if (pageId === 'best') return Number(deal.dealScore) >= 55;
    if (pageId === 'steam-under-10') {
      return String(deal.storeID) === '1' && Number(deal.salePrice) <= 10;
    }
    if (pageId === 'coop') {
      return (deal.tags || []).some(tag => /\b(?:online|local|shared\/split screen)?\s*co-op\b/i.test(tag));
    }
    if (pageId === 'indie') return Boolean(deal.isIndie);
    if (pageId === 'deep') {
      return Number(deal.discount) >= 70 && Number(deal.dealScore) >= 65;
    }
    if (pageId === 'hidden') {
      return Number(deal.userRating) >= 85 &&
        Number(deal.reviewCount) >= 100 &&
        Number(deal.reviewCount) < 5000 &&
        Number(deal.dealScore) >= 60;
    }
    return false;
  });
  if (pageId === 'deep') {
    return selected.sort(
      (a, b) => Number(b.discount) - Number(a.discount) ||
        Number(b.dealScore) - Number(a.dealScore) ||
        Number(b.reviewCount) - Number(a.reviewCount)
    );
  }
  return selected.sort(
    (a, b) => Number(b.dealScore) - Number(a.dealScore) ||
      Number(b.reviewCount) - Number(a.reviewCount)
  );
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildSearchPages(options = {}) {
  const outputDir = path.resolve(options.outputDir || path.join(root, 'deals'));
  const snapshot = options.snapshot || options.base || readJSON(path.join(root, 'deals.json'));
  let deals = options.deals;
  if (!deals) {
    const base = options.base || snapshot;
    const enriched = options.enriched || readJSON(path.join(root, 'enriched-deals.json'));
    deals = buildDealDataset(base, enriched, options.config || config);
  }

  const gameRoutes = new Map(
    selectGamePageDeals(deals).map(deal => [deal.key, gamePageRoute(deal)])
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const counts = {};
  const selectedById = {};
  const collections = Object.values(PAGE_DEFINITIONS).map(definition => {
    const selected = selectLandingDeals(deals, definition.id);
    counts[definition.id] = selected.length;
    selectedById[definition.id] = selected.slice(0, definition.limit).map(deal => ({
      ...deal,
      gamePageRoute: gameRoutes.get(deal.key) || ''
    }));
    return {
      ...definition,
      count: selected.length,
      indexable: selected.length >= MIN_INDEXABLE_DEALS
    };
  });

  const generatedRoutes = ['index.html'];
  const routes = ['index.html'];
  const hub = { ...HUB_DEFINITION, collections };
  fs.writeFileSync(
    path.join(outputDir, HUB_DEFINITION.route),
    renderLandingPage(hub, [], snapshot)
  );

  for (const definition of collections) {
    const selected = selectedById[definition.id];
    fs.writeFileSync(
      path.join(outputDir, definition.route),
      renderLandingPage({ ...definition, collections }, selected, snapshot)
    );
    generatedRoutes.push(definition.route);
    if (definition.indexable) routes.push(definition.route);
  }

  return { routes, counts, generatedRoutes };
}

if (require.main === module) {
  const result = buildSearchPages();
  for (const definition of Object.values(PAGE_DEFINITIONS)) {
    const status = result.routes.includes(definition.route) ? 'indexable' : 'noindex';
    console.log(`${definition.route}: ${result.counts[definition.id]} matches (${status})`);
  }
  console.log(`Generated ${result.generatedRoutes.length} deal pages.`);
}

module.exports = { HUB_DEFINITION, PAGE_DEFINITIONS, buildSearchPages, selectLandingDeals };
