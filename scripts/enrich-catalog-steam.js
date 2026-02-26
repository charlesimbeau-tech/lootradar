// Enrich CheapShark deals with Steam + SteamSpy metadata (no API key required)
// Usage: node scripts/enrich-catalog-steam.js

const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'LootRadar/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseSteamDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchSteamMeta(appId) {
  const appdetailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=en&cc=us`;
  const appdetails = await fetchJSON(appdetailsUrl);
  const payload = appdetails?.[String(appId)];
  if (!payload || !payload.success || !payload.data) return null;

  const d = payload.data;

  let steamSpy = null;
  try {
    steamSpy = await fetchJSON(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`);
  } catch (_) {}

  const genres = (d.genres || []).map(g => g.description).filter(Boolean);
  const categories = (d.categories || []).map(c => c.description).filter(Boolean);
  const tags = steamSpy?.tags ? Object.keys(steamSpy.tags).slice(0, 12) : [];
  const platforms = Object.entries(d.platforms || {})
    .filter(([, supported]) => !!supported)
    .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));

  const metacritic = d.metacritic?.score || null;
  const rating = steamSpy?.score_rank ? Number(steamSpy.score_rank) : null;

  return {
    id: Number(appId),
    slug: d.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || String(appId),
    name: d.name || null,
    released: parseSteamDate(d.release_date?.date),
    rating,
    ratingsCount: steamSpy?.userscore ? Number(steamSpy.userscore) : 0,
    metacritic,
    genres,
    tags: [...new Set([...tags, ...categories])].slice(0, 14),
    platforms,
    backgroundImage: d.header_image || null,
    source: 'steam'
  };
}

async function main() {
  const dealsPath = path.join(__dirname, '..', 'deals.json');
  const dealsData = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
  const deals = dealsData.deals || [];

  const cache = new Map();
  const enriched = [];
  let hits = 0;

  for (let i = 0; i < deals.length; i++) {
    const d = deals[i];
    const row = { ...d, rawg: null };
    const appId = d.steamAppID && String(d.steamAppID).trim();

    if (appId) {
      try {
        if (!cache.has(appId)) {
          cache.set(appId, await fetchSteamMeta(appId));
          await sleep(180);
        }
        const meta = cache.get(appId);
        if (meta) {
          row.rawg = meta; // keep compatibility with existing frontend logic
          hits++;
        }
      } catch (err) {
        console.warn(`Steam lookup failed for app ${appId} (${d.title}): ${err.message}`);
      }
    }

    enriched.push(row);
    if ((i + 1) % 30 === 0) console.log(`Processed ${i + 1}/${deals.length}...`);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    source: {
      deals: 'CheapShark',
      metadata: 'Steam+SteamSpy (no key)'
    },
    coverage: {
      totalDeals: deals.length,
      metadataMatches: hits,
      matchRate: deals.length ? Number((hits / deals.length).toFixed(4)) : 0
    },
    stores: dealsData.stores || {},
    games: enriched
  };

  fs.writeFileSync(path.join(__dirname, '..', 'enriched-deals.json'), JSON.stringify(out));
  console.log(`Saved enriched-deals.json (${hits}/${deals.length} metadata matches)`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
