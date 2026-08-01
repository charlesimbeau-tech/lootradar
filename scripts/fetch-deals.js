// Fetch deals from CheapShark API and save to deals.json
// Run by GitHub Actions every three hours

const fs = require('fs');
const path = require('path');
const { createCheapSharkClient } = require('../lib/cheapshark-client.js');
const { validateSnapshot } = require('../lib/deal-snapshot-validator.js');
const { normalizeDeal: normalizeForScoring } = require('../lib/deal-normalizer.js');
const { calculateDealScore, getDefaultEligibility } = require('../lib/deal-score.js');
const editorialConfig = require('../config/editorial-config.js');

const API = 'https://www.cheapshark.com/api/1.0';
const MAX_PRICE = Number(process.env.MAX_PRICE || 70);
const PAGE_SIZE = Math.min(60, Number(process.env.PAGE_SIZE || 60));
const PAGES_PER_STORE = Number(process.env.PAGES_PER_STORE || 3);
// Deal Rating sorts deep discounts to the top, which buries recent releases.
// Recent is global across the same active stores: fetching it once avoids
// repeating two overlapping pages for every individual store.
const GLOBAL_RECENT_PAGES = Number(process.env.GLOBAL_RECENT_PAGES || 8);
// Useful depth varies enormously by store: Steam still yields qualifying games
// 30 pages in, while Fanatical is mostly noise past page 15. Rather than guess a
// flat number, keep paging while a page still earns its keep.
// Measured the hard way: 10 pages per store drew a one-hour block around the
// fiftieth request and failed most of the refresh. CheapShark's limiter cares
// about rate, not just totals. Central pacing now makes it safe to let productive
// stores compete for a deeper slice of the same fixed global request budget.
const MAX_PAGES_PER_STORE = Number(process.env.MAX_PAGES_PER_STORE || 5);
const MIN_PAGE_YIELD = Number(process.env.MIN_PAGE_YIELD || 0.25);
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS || 70);
// CheapShark temporarily bans clients that pack too many calls into a short
// window. This is enforced inside the HTTP client so retries cannot bypass it.
const REQUEST_INTERVAL_MS = Math.max(0, Number(process.env.REQUEST_INTERVAL_MS || 1500));
// Alternate stores carried per game. deals.json is committed on every refresh,
// so this is capped: six covers the realistic spread without doubling the file.
const MAX_ALTERNATE_STORES = Number(process.env.MAX_ALTERNATE_STORES || 6);
const outPath = path.join(__dirname, '..', 'deals.json');

const cheapShark = createCheapSharkClient({
  baseUrl: API,
  maxRetries: 4,
  baseDelayMs: 1000,
  minRequestIntervalMs: REQUEST_INTERVAL_MS,
  headers: {
    'User-Agent': 'LootRadar-Bot/1.2 (contact@thelootradar.com; https://thelootradar.com)',
    Accept: 'application/json'
  }
});

async function fetchJSON(pathname) {
  return cheapShark.get(pathname);
}

function loadPreviousSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch (error) {
    console.warn(`Existing deal snapshot is unavailable: ${error.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateStoreCeiling(rankedCeiling, remainingStores, pagesPerStore) {
  const ceiling = Math.max(0, Number(rankedCeiling) || 0);
  const waiting = Math.max(0, Number(remainingStores) || 0);
  const floor = Math.max(0, Number(pagesPerStore) || 0);
  return Math.max(0, ceiling - waiting * floor);
}

// Exported so the grouping rules can be tested without a network fetch.
function groupOffersByGame(deals, maxAlternates = MAX_ALTERNATE_STORES) {
  // One entry per game, but keep the other stores that carry it. Collapsing to
  // a single listing threw away the comparison this site exists to make: three
  // stores sell Cyberpunk 2077 and the snapshot remembered one of them.
  //
  // Grouping on the Steam app id where there is one also merges listings whose
  // titles differ only by punctuation or spacing, which exact-title matching
  // left as separate games.
  const groups = new Map();
  for (const deal of deals) {
    const groupKey = String(deal.steamAppID || '').trim() || String(deal.title || '').trim();
    if (!groupKey) continue;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(deal);
  }

  const deduped = {};
  for (const offers of groups.values()) {
    // Cheapest wins, not the biggest percentage. Stores publish different
    // normal prices, so the deepest discount is not reliably the lowest price,
    // and on a price comparison site the price is the answer. Savings only
    // breaks ties.
    const ranked = offers.slice().sort((a, b) =>
      (parseFloat(a.salePrice) || 0) - (parseFloat(b.salePrice) || 0) ||
      (parseFloat(b.savings) || 0) - (parseFloat(a.savings) || 0)
    );

    // One offer per store, cheapest first, so the alternates are a genuine
    // price comparison rather than the same shop repeated.
    const perStore = new Map();
    for (const offer of ranked) {
      const storeID = String(offer.storeID || '');
      if (!perStore.has(storeID)) perStore.set(storeID, offer);
    }

    const featured = ranked[0];
    const alternates = [...perStore.values()]
      .filter(offer => offer.dealID !== featured.dealID)
      .slice(0, maxAlternates)
      .map(offer => ({
        storeID: offer.storeID,
        dealID: offer.dealID,
        salePrice: offer.salePrice,
        normalPrice: offer.normalPrice,
        savings: offer.savings
      }));

    deduped[featured.title] = alternates.length ? { ...featured, alternates } : featured;
  }
  return deduped;
}

async function main() {
  const previousSnapshot = loadPreviousSnapshot();
  console.log('Fetching store list...');
  const stores = await fetchJSON('/stores');
  const activeStores = stores.filter(s => s.isActive === 1);

  const storeMap = {};
  activeStores.forEach(s => {
    storeMap[s.storeID] = {
      name: s.storeName,
      icon: `https://www.cheapshark.com/img/stores/icons/${parseInt(s.storeID) - 1}.png`
    };
  });

  console.log(`Found ${activeStores.length} active stores. Fetching deals...`);
  console.log(
    `Config: upperPrice=${MAX_PRICE}, pageSize=${PAGE_SIZE}, ` +
    `pages=${PAGES_PER_STORE}-${MAX_PAGES_PER_STORE}/store, globalRecent=${GLOBAL_RECENT_PAGES}, ` +
    `minYield=${MIN_PAGE_YIELD}, ` +
    `budget=${MAX_REQUESTS}, requestInterval=${REQUEST_INTERVAL_MS}ms`
  );

  const allDeals = [];
  const failedStores = [];
  let requestsUsed = 1; // the store list above

  function normalizeDeal(d) {
    return {
      title: d.title,
      salePrice: d.salePrice,
      normalPrice: d.normalPrice,
      savings: d.savings,
      storeID: d.storeID,
      dealID: d.dealID,
      thumb: d.thumb,
      steamAppID: d.steamAppID,
      metacriticScore: d.metacriticScore,
      steamRatingPercent: d.steamRatingPercent,
      steamRatingCount: d.steamRatingCount,
      steamRatingText: d.steamRatingText,
      dealRating: d.dealRating,
      releaseDate: d.releaseDate
    };
  }

  // Share of a page that would actually reach the site. A page of listings that
  // all fail the quality gate is bandwidth we pay for and nobody ever sees.
  function pageYield(deals) {
    if (!deals.length) return 0;
    const keepers = deals.filter(raw => {
      const deal = normalizeForScoring(raw, {});
      const score = calculateDealScore(deal, editorialConfig);
      return score.score >= editorialConfig.thresholds.minDealScore &&
        getDefaultEligibility(deal, editorialConfig, score).eligible;
    }).length;
    return keepers / deals.length;
  }

  async function fetchDealPages(storeIDs, sortBy, pageLimit, { adaptive = false, ceiling = MAX_REQUESTS } = {}) {
    const collected = [];
    const storeFilter = storeIDs ? `storeID=${storeIDs}&` : '';
    for (let page = 0; page < pageLimit; page++) {
      if (requestsUsed >= ceiling) break;
      const deals = await fetchJSON(
        `/deals?${storeFilter}upperPrice=${MAX_PRICE}&pageSize=${PAGE_SIZE}&pageNumber=${page}&steamRating=70&minimumReviewCount=100&onSale=1&sortBy=${sortBy}`
      );
      requestsUsed += 1;

      if (Array.isArray(deals) && deals.length) collected.push(...deals.map(normalizeDeal));
      if (!Array.isArray(deals) || deals.length < Math.floor(PAGE_SIZE * 0.25)) break;
      // Past the guaranteed floor, keep going only while the store is still
      // returning games worth showing.
      if (adaptive && page + 1 >= PAGES_PER_STORE && pageYield(deals) < MIN_PAGE_YIELD) break;
      await sleep(350);
    }
    return collected;
  }

  // Hold back enough budget that a deep primary pass cannot starve the recent
  // pass, which is the only thing keeping the new-arrivals collection stocked.
  const recentReserve = GLOBAL_RECENT_PAGES;
  const minimumPrimaryBudget = 1 + activeStores.length * Math.min(PAGES_PER_STORE, MAX_PAGES_PER_STORE);
  const rankedCeiling = Math.min(
    MAX_REQUESTS,
    Math.max(minimumPrimaryBudget, MAX_REQUESTS - recentReserve)
  );

  // Fetch deals sequentially so one refresh does not create a request burst.
  for (const [storeIndex, store] of activeStores.entries()) {
    let storeCount = 0;
    const remainingStores = activeStores.length - storeIndex - 1;
    const storeCeiling = calculateStoreCeiling(
      rankedCeiling,
      remainingStores,
      Math.min(PAGES_PER_STORE, MAX_PAGES_PER_STORE)
    );
    try {
      const ranked = await fetchDealPages(String(store.storeID), 'DealRating', MAX_PAGES_PER_STORE, {
        adaptive: true,
        ceiling: storeCeiling
      });
      allDeals.push(...ranked);
      storeCount += ranked.length;
    } catch (error) {
      failedStores.push(store.storeName);
      console.warn(`  ${store.storeName}: FAILED - ${error.message}`);
      await sleep(350);
      continue;
    }

    console.log(`  ${store.storeName}: ${storeCount} ranked deals`);
    await sleep(350);
  }

  // Best effort only. One cross-store Recent pass replaces fourteen per-store
  // passes, freeing budget for deeper ranked pages while preserving new arrivals.
  if (GLOBAL_RECENT_PAGES > 0 && requestsUsed < MAX_REQUESTS) {
    const activeStoreIDs = activeStores.map(store => store.storeID).join(',');
    try {
      const recent = await fetchDealPages(activeStoreIDs, 'Recent', GLOBAL_RECENT_PAGES);
      allDeals.push(...recent);
      console.log(`  Recent across all stores: ${recent.length} deals`);
    } catch (error) {
      console.warn(`  Global recent pass skipped - ${error.message}`);
    }
  }

  const deduped = groupOffersByGame(allDeals);

  const output = {
    stores: storeMap,
    deals: Object.values(deduped),
    updatedAt: new Date().toISOString(),
    dealCount: Object.keys(deduped).length,
    storeCount: activeStores.length
  };

  validateSnapshot(output, previousSnapshot, failedStores);
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`\nSaved ${output.dealCount} deals from ${output.storeCount} stores to deals.json`);
  console.log(`Used ${requestsUsed} of ${MAX_REQUESTS} budgeted requests.`);
  console.log(`Updated at: ${output.updatedAt}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  calculateStoreCeiling,
  groupOffersByGame,
  loadPreviousSnapshot,
  main
};
