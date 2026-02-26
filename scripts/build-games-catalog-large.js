// Build a larger umbrella catalog using SteamSpy paginated "all" endpoint (no API key)
// Usage:
//   node scripts/build-games-catalog-large.js
//   MAX_GAMES=8000 MAX_PAGES=12 node scripts/build-games-catalog-large.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const MAX_GAMES = Number(process.env.MAX_GAMES || 5000);
const MAX_PAGES = Number(process.env.MAX_PAGES || 8); // SteamSpy all pages are ~1000 each
const SLEEP_MS = Number(process.env.SLEEP_MS || 300);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'LootRadar/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error for ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dictToRows(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj).filter((v) => v && v.appid && v.name);
}

function splitCsv(s) {
  if (!s) return [];
  return String(s)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function scoreRow(r) {
  // Rank mostly by social proof + quality + activity
  const owners = Number(String(r.owners || '0').split('..').pop() || 0);
  const positive = Number(r.positive || 0);
  const negative = Number(r.negative || 0);
  const scoreRank = Number(r.score_rank || 0);
  const avg2w = Number(r.average_2weeks || 0);
  const ratingRatio = positive + negative > 0 ? positive / (positive + negative) : 0;

  return (
    owners * 1 +
    positive * 40 +
    negative * -8 +
    scoreRank * 500 +
    avg2w * 20 +
    ratingRatio * 100000
  );
}

async function main() {
  const rows = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://steamspy.com/api.php?request=all&page=${page}`;
    try {
      const data = await fetchJSON(url);
      const pageRows = dictToRows(data);
      if (!pageRows.length) {
        console.log(`Page ${page}: no rows, stopping.`);
        break;
      }
      rows.push(...pageRows);
      console.log(`Page ${page}: +${pageRows.length} rows (total ${rows.length})`);
      await sleep(SLEEP_MS);
    } catch (e) {
      console.warn(`Page ${page} failed: ${e.message}`);
      break;
    }
  }

  const byApp = new Map();
  for (const r of rows) {
    const id = String(r.appid);
    if (!byApp.has(id)) byApp.set(id, r);
  }

  const deduped = [...byApp.values()]
    .filter((r) => r.name && r.name.length >= 2)
    .map((r) => ({ ...r, __score: scoreRow(r) }))
    .sort((a, b) => b.__score - a.__score)
    .slice(0, MAX_GAMES);

  const games = deduped.map((r) => ({
    appid: String(r.appid),
    title: r.name,
    genres: splitCsv(r.genre),
    tags: r.tags ? Object.keys(r.tags).slice(0, 16) : [],
    rating: Number(r.score_rank || 0),
    userscore: Number(r.userscore || 0),
    owners: r.owners || null,
    avg_forever: Number(r.average_forever || 0),
    avg_2weeks: Number(r.average_2weeks || 0),
    price_usd: r.price ? Number(r.price) / 100 : null,
    initial_price_usd: r.initialprice ? Number(r.initialprice) / 100 : null,
    discount: r.discount ? Number(r.discount) : 0,
    positive: Number(r.positive || 0),
    negative: Number(r.negative || 0),
    thumb: `https://cdn.cloudflare.steamstatic.com/steam/apps/${r.appid}/header.jpg`
  }));

  const out = {
    updatedAt: new Date().toISOString(),
    source: 'SteamSpy all pages',
    pagesFetched: MAX_PAGES,
    gameCount: games.length,
    games
  };

  const root = path.join(__dirname, '..');
  fs.writeFileSync(path.join(root, 'games-catalog.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(root, 'games-catalog-large.json'), JSON.stringify(out));

  console.log(`Saved games-catalog.json + games-catalog-large.json with ${games.length} games`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
