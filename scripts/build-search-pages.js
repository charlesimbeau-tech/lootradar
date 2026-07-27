'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
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
    description: 'Browse today’s strongest PC game deals, selected from the current CheapShark snapshot using quality, value, and review confidence.',
    heading: 'Best PC game deals today',
    lede: 'A short list of well-reviewed games whose current prices deserve a closer look.',
    introduction: [
      'The largest discount badge is rarely the whole story. This page starts with the latest listings supplied by CheapShark, then applies LootRadar’s quality and content checks before ranking what remains. The result favors games with credible player feedback and prices that look meaningful in the current snapshot.',
      'Use the list as a focused starting point, not a command to buy. Genre, playtime, and taste still matter more than any score. Each card shows the store, current listed price, review confidence, Deal Score, and the specific signal that helped the offer rank.'
    ],
    criteria: 'Listings must clear LootRadar’s default eligibility rules and earn a Deal Score of at least 55. Scores combine game quality, price value, discount strength, review confidence, and player interest. Obvious add-ons, soundtracks, demos, currency packs, and lower-confidence entries are filtered before ranking. The top results are ordered by Deal Score, with review volume breaking ties.',
    caveat: 'CheapShark supplies the store and price listings. LootRadar supplies the filtering and score. Prices can change after the snapshot or after you leave this page.',
    cardSummary: 'The strongest balance of game quality, price value, and review confidence in the latest snapshot.',
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
    description: 'Find well-reviewed Steam storefront deals under $10, ranked by LootRadar using the current CheapShark price snapshot and review confidence.',
    heading: 'Steam deals under $10',
    lede: 'Steam storefront listings with single-digit prices and enough quality evidence to make the shortlist.',
    introduction: [
      'A low price is useful only when the game still looks worth your time. These picks are Steam storefront listings priced at $10 or less in the current CheapShark snapshot. They also have to clear LootRadar’s normal quality and content checks, so the page does not become a bin of cheap add-ons and low-confidence releases.',
      'The order reflects Deal Score rather than price alone. A $9 game with strong player feedback can rank above a $2 game with weaker evidence. Check the review count beside the rating, read the reason on each card, and confirm the final price on Steam before buying.'
    ],
    criteria: 'A listing must come from the Steam storefront, cost no more than $10, and pass LootRadar’s default eligibility rules. Eligible entries are ranked by Deal Score, which weighs player and critic signals, the strength of the current price, discount depth, review volume, and player interest. DLC, soundtracks, demos, currency packs, and other excluded content do not qualify.',
    caveat: 'This page covers Steam’s storefront listing returned in the snapshot. Other sellers may offer Steam keys at different prices, and CheapShark’s participating-store inventory can change.',
    cardSummary: 'Quality-qualified Steam storefront listings at $10 or less.',
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
    description: 'Browse quality-qualified co-op PC game deals with explicit co-op metadata, current CheapShark prices, and transparent LootRadar ranking reasons.',
    heading: 'Co-op game deals worth sharing',
    lede: 'Games explicitly tagged for co-op play, filtered for quality before price cuts enter the conversation.',
    introduction: [
      '“Multiplayer” can mean a competitive ladder, a crowded server, or a mode that has little to do with playing alongside a friend. This collection is narrower. A game needs an explicit online, local, shared-screen, or general co-op tag in the available Steam metadata before it can appear here.',
      'After that metadata check, the same quality-first rules apply as elsewhere on LootRadar. Strong player feedback, credible review volume, and a worthwhile current price help a listing rise. The cards cannot tell you whether a game supports cross-play, how many players it accepts, or whether remote play is comfortable, so confirm those details on the store page.'
    ],
    criteria: 'Listings must pass the default quality and content filters and include an explicit co-op tag in the available metadata. A generic multiplayer tag is not enough. Qualifying games are ordered by Deal Score, combining quality, price value, discount strength, review confidence, and player interest. This keeps a large discount from carrying a poorly supported game into the list.',
    caveat: 'Co-op classification depends on available Steam metadata, which does not cover every CheapShark listing. Treat this as a curated set of supported matches rather than a complete market catalog.',
    cardSummary: 'Explicitly tagged co-op games that also clear the normal quality bar.',
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
    description: 'Discover well-reviewed indie PC game deals selected from current CheapShark listings using available Steam metadata and LootRadar’s Deal Score.',
    heading: 'Indie game deals worth discovering',
    lede: 'Independent games with strong player feedback and current prices that stand out.',
    introduction: [
      'Indie is not a promise of quality, and a familiar publisher is not a reason to dismiss a smaller game. This page uses available Steam genre and tag metadata to identify independent releases, then applies the same review, content, and value checks used across LootRadar.',
      'The shortlist favors games with convincing player sentiment and enough reviews to make that sentiment useful. Price still matters, but it cannot do all the work. Each card explains the rating, review volume, store, current listed price, and recommendation signal so you can judge whether a less-familiar title deserves space in your backlog.'
    ],
    criteria: 'A listing needs Indie in its available genre or tag metadata, must pass the default quality and content rules, and is then ranked by Deal Score. That score combines game quality, current price value, discount strength, review confidence, and player interest. Excluded add-ons and low-confidence entries remain out even when their percentage discounts look dramatic.',
    caveat: 'Steam metadata enrichment is incomplete, so some independent games will not be classified for this page. Prices come from the current CheapShark snapshot and may change.',
    cardSummary: 'Indie-tagged games backed by useful review evidence and a worthwhile current listing.',
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
    description: 'See PC game discounts of 70% or more that still clear LootRadar’s quality checks, ranked from the latest CheapShark price snapshot.',
    heading: 'Deep discounts that clear the quality bar',
    lede: 'Price cuts of at least 70% where the game evidence remains stronger than the sale badge.',
    introduction: [
      'A 90% discount can make almost anything look urgent. It does not make the underlying game better, and it does not prove that the list price reflects ordinary market value. This collection starts with discounts of at least 70%, then keeps only listings that pass LootRadar’s quality and content rules.',
      'That second step matters. Player sentiment, review volume, current price value, and other score components can lift or lower a deal after the discount is counted. The page is useful when you want a substantial sale without abandoning evidence, but the final decision should still account for genre, edition, and whether you will actually play it.'
    ],
    criteria: 'Every listing must be at least 70% below its stated normal price, pass the default eligibility checks, and earn a Deal Score of 65 or higher. The higher score floor prevents discount depth from dominating the collection. Obvious non-game content and lower-confidence listings are excluded before qualifying offers are ordered by Deal Score.',
    caveat: 'Normal prices and discounts come from CheapShark-listed store data. A large percentage is not proof of an all-time low, and LootRadar does not label it that way without verified history.',
    cardSummary: 'Discounts of at least 70% that also earn a stronger Deal Score.',
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
    description: 'Find lesser-known PC game deals with at least 85% positive reviews, credible review volume, and a strong LootRadar Deal Score.',
    heading: 'Hidden-gem deals with strong player reviews',
    lede: 'Less-visible games with unusually positive feedback and enough reviews to support the signal.',
    introduction: [
      '“Hidden gem” is often used as a substitute for “game I like.” LootRadar gives the phrase a narrower job. These listings need unusually positive player feedback, a meaningful but not blockbuster-sized review history, and a current Deal Score strong enough to survive the normal value and content checks.',
      'The review ceiling keeps the collection focused on games outside the largest audiences; the review floor prevents a handful of early ratings from looking definitive. It is still a discovery aid, not a claim that every game is obscure or right for every player. Use the genre and store details to narrow the list before adding another hopeful purchase to the backlog.'
    ],
    criteria: 'A game must be at least 85% positive, have 100 to 4,999 recorded player reviews, pass the default eligibility rules, and earn a Deal Score of at least 60. Qualifying listings are ranked by Deal Score and then review volume. These boundaries favor strong but reasonably supported sentiment without turning the page into another list of the most famous PC games.',
    caveat: 'Review counts and ratings come from available enrichment and listing data. Missing metadata can keep a game out, and “hidden” refers to the collection boundaries rather than a universal popularity claim.',
    cardSummary: 'Games with at least 85% positive reviews and a smaller, credible review base.',
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
  description: 'Browse LootRadar’s permanent PC game deal collections, each built from current CheapShark listings with clear quality and selection rules.',
  heading: 'Browse quality-first PC game deals',
  lede: 'Permanent collections for finding worthwhile prices without treating every large discount as a recommendation.',
  introduction: [
    'LootRadar’s homepage is useful for searching and changing filters. This hub gives the strongest collections a permanent address, so you can return to the same kind of shortlist without rebuilding it each time. Choose by budget, play style, visibility, or discount depth.',
      'Every collection begins with the current CheapShark price snapshot and applies a published LootRadar rule set. The pages show listings, prices, review context, and ranking reasons before JavaScript runs. That makes a shared link immediately useful, even when scripts do not run, and gives a friend something more specific than another vague sale page.'
  ],
  criteria: 'All collection pages exclude listings that fail LootRadar’s default content and quality rules unless a page states a stricter boundary. Each page explains its own price, metadata, rating, review-count, discount, or Deal Score requirements. Collections with fewer than 6 matches remain available as a useful fallback but are marked not to appear in search results until inventory recovers.',
  caveat: 'Prices come from CheapShark and the published snapshot refreshes every three hours. A listing may change before the next snapshot or after you follow its store link.',
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

  fs.mkdirSync(outputDir, { recursive: true });

  const counts = {};
  const selectedById = {};
  const collections = Object.values(PAGE_DEFINITIONS).map(definition => {
    const selected = selectLandingDeals(deals, definition.id);
    counts[definition.id] = selected.length;
    selectedById[definition.id] = selected.slice(0, definition.limit);
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
