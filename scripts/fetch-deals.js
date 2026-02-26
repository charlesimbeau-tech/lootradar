// Fetch deals from CheapShark API and save to deals.json
// Run by GitHub Actions every hour

const https = require('https');
const fs = require('fs');
const path = require('path');

const API = 'https://www.cheapshark.com/api/1.0';
const MAX_PRICE = Number(process.env.MAX_PRICE || 70);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 80);
const PAGES_PER_STORE = Number(process.env.PAGES_PER_STORE || 3);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Fetching store list...');
  const stores = await fetchJSON(`${API}/stores`);
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

  // Fetch deals from each store with pagination + small delay to be polite
  for (const store of activeStores) {
    let storeCount = 0;
    try {
      for (let page = 0; page < PAGES_PER_STORE; page++) {
        const deals = await fetchJSON(
          `${API}/deals?storeID=${store.storeID}&upperPrice=${MAX_PRICE}&pageSize=${PAGE_SIZE}&pageNumber=${page}&sortBy=Deal+Rating`
        );

        if (Array.isArray(deals) && deals.length) {
          allDeals.push(...deals.map(d => ({
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
          })));
          storeCount += deals.length;
        }

        // if a page is sparse/empty, likely no more high-quality deals for this store
        if (!Array.isArray(deals) || deals.length < Math.floor(PAGE_SIZE * 0.25)) break;
        await sleep(120);
      }
      console.log(`  ${store.storeName}: ${storeCount} deals`);
    } catch (e) {
      console.warn(`  ${store.storeName}: FAILED - ${e.message}`);
    }
    await sleep(180);
  }

  // Dedupe - keep best deal per title
  const deduped = {};
  allDeals.forEach(d => {
    const savings = parseFloat(d.savings) || 0;
    if (!deduped[d.title] || savings > parseFloat(deduped[d.title].savings)) {
      deduped[d.title] = d;
    }
  });

  const output = {
    stores: storeMap,
    deals: Object.values(deduped),
    updatedAt: new Date().toISOString(),
    dealCount: Object.keys(deduped).length,
    storeCount: activeStores.length,
  };

  const outPath = path.join(__dirname, '..', 'deals.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`\nSaved ${output.dealCount} deals from ${output.storeCount} stores to deals.json`);
  console.log(`Updated at: ${output.updatedAt}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
