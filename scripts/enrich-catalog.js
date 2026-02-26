// Enrich CheapShark deals with RAWG metadata
// Usage: RAWG_API_KEY=xxx node scripts/enrich-catalog.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const RAWG_KEY = process.env.RAWG_API_KEY;
const RAWG_API = 'https://api.rawg.io/api';

if (!RAWG_KEY) {
  console.error('Missing RAWG_API_KEY env var.');
  process.exit(1);
}

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

function normalizeTitle(t = '') {
  return t
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchRawg(title) {
  const q = encodeURIComponent(title);
  const url = `${RAWG_API}/games?key=${RAWG_KEY}&search=${q}&page_size=5`;
  const data = await fetchJSON(url);
  if (!data || !Array.isArray(data.results) || !data.results.length) return null;

  const normalized = normalizeTitle(title);
  const exactish = data.results.find(g => normalizeTitle(g.name) === normalized);
  return exactish || data.results[0];
}

async function main() {
  const dealsPath = path.join(__dirname, '..', 'deals.json');
  const dealsData = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));

  const deals = dealsData.deals || [];
  const enriched = [];
  let hits = 0;

  for (let i = 0; i < deals.length; i++) {
    const d = deals[i];
    const row = { ...d, rawg: null };

    try {
      const game = await searchRawg(d.title);
      if (game) {
        hits++;
        row.rawg = {
          id: game.id,
          slug: game.slug,
          name: game.name,
          released: game.released || null,
          rating: game.rating || null,
          ratingsCount: game.ratings_count || 0,
          metacritic: game.metacritic || null,
          genres: (game.genres || []).map(g => g.name),
          tags: (game.tags || []).slice(0, 8).map(t => t.name),
          platforms: (game.platforms || []).map(p => p.platform?.name).filter(Boolean),
          backgroundImage: game.background_image || null
        };
      }
    } catch (err) {
      console.warn(`RAWG lookup failed for "${d.title}": ${err.message}`);
    }

    enriched.push(row);
    if ((i + 1) % 25 === 0) console.log(`Processed ${i + 1}/${deals.length}...`);
    await sleep(220);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    source: {
      deals: 'CheapShark',
      metadata: 'RAWG'
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
