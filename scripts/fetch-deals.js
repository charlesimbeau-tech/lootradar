// Fetch deals from CheapShark API and save to deals.json
// Run by GitHub Actions every hour

const fs = require('fs');
const path = require('path');
const { createCheapSharkClient } = require('../lib/cheapshark-client.js');
const { validateSnapshot } = require('../lib/deal-snapshot-validator.js');

const API = 'https://www.cheapshark.com/api/1.0';
const MAX_PRICE = Number(process.env.MAX_PRICE || 70);
const PAGE_SIZE = Math.min(60, Number(process.env.PAGE_SIZE || 60));
const PAGES_PER_STORE = Number(process.env.PAGES_PER_STORE || 3);
// Deal Rating sorts deep discounts to the top, which buries recent releases
// because they rarely discount hard. A short second pass sorted by recent
// price activity is what keeps the new-arrivals collection stocked.
const RECENT_PAGES_PER_STORE = Number(process.env.RECENT_PAGES_PER_STORE || 2);
const outPath = path.join(__dirname, '..', 'deals.json');

const cheapShark = createCheapSharkClient({
  baseUrl: API,
  maxRetries: 4,
  baseDelayMs: 1000,
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
  console.log(`Config: upperPrice=${MAX_PRICE}, pageSize=${PAGE_SIZE}, pagesPerStore=${PAGES_PER_STORE}`);

  const allDeals = [];
  const failedStores = [];

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

  async function fetchStorePages(store, sortBy, pageLimit) {
    const collected = [];
    for (let page = 0; page < pageLimit; page++) {
      const deals = await fetchJSON(
        `/deals?storeID=${store.storeID}&upperPrice=${MAX_PRICE}&pageSize=${PAGE_SIZE}&pageNumber=${page}&steamRating=70&minimumReviewCount=100&onSale=1&sortBy=${sortBy}`
      );

      if (Array.isArray(deals) && deals.length) collected.push(...deals.map(normalizeDeal));
      if (!Array.isArray(deals) || deals.length < Math.floor(PAGE_SIZE * 0.25)) break;
      await sleep(250);
    }
    return collected;
  }

  // Fetch deals sequentially so one refresh does not create a request burst.
  for (const store of activeStores) {
    let storeCount = 0;
    let recentCount = 0;
    try {
      const ranked = await fetchStorePages(store, 'DealRating', PAGES_PER_STORE);
      allDeals.push(...ranked);
      storeCount += ranked.length;
    } catch (error) {
      failedStores.push(store.storeName);
      console.warn(`  ${store.storeName}: FAILED - ${error.message}`);
      await sleep(350);
      continue;
    }

    // Best effort only. The primary pass already produced a usable snapshot,
    // so a failure here must not abort an otherwise healthy refresh.
    if (RECENT_PAGES_PER_STORE > 0) {
      await sleep(250);
      try {
        const recent = await fetchStorePages(store, 'Recent', RECENT_PAGES_PER_STORE);
        allDeals.push(...recent);
        recentCount += recent.length;
      } catch (error) {
        console.warn(`  ${store.storeName}: recent pass skipped - ${error.message}`);
      }
    }

    console.log(`  ${store.storeName}: ${storeCount} deals (+${recentCount} from recent pass)`);
    await sleep(350);
  }

  const deduped = {};
  allDeals.forEach(deal => {
    const savings = parseFloat(deal.savings) || 0;
    if (!deduped[deal.title] || savings > parseFloat(deduped[deal.title].savings)) {
      deduped[deal.title] = deal;
    }
  });

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
  console.log(`Updated at: ${output.updatedAt}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  loadPreviousSnapshot,
  main
};
