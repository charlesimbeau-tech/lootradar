// Build umbrella game catalog (not just live deals) using SteamSpy (no API key)
// Usage: node scripts/build-games-catalog.js

const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'LootRadar/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function dictToRows(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj).filter(v => v && v.appid);
}

function splitCsv(s) {
  if (!s) return [];
  return String(s).split(',').map(x => x.trim()).filter(Boolean);
}

async function main() {
  const endpoints = [
    'https://steamspy.com/api.php?request=top100in2weeks',
    'https://steamspy.com/api.php?request=top100forever',
    'https://steamspy.com/api.php?request=top100owned'
  ];

  const sets = await Promise.all(endpoints.map(fetchJSON));
  const rawRows = sets.flatMap(dictToRows);

  const byApp = new Map();
  rawRows.forEach(r => {
    const id = String(r.appid);
    const prev = byApp.get(id);
    if (!prev || (Number(r.owners || 0) > Number(prev.owners || 0))) byApp.set(id, r);
  });

  const games = [...byApp.values()].map(r => ({
    appid: String(r.appid),
    title: r.name,
    genres: splitCsv(r.genre),
    tags: r.tags ? Object.keys(r.tags).slice(0, 12) : [],
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
    source: 'SteamSpy',
    gameCount: games.length,
    games
  };

  fs.writeFileSync(path.join(__dirname, '..', 'games-catalog.json'), JSON.stringify(out));
  console.log(`Saved games-catalog.json with ${games.length} games`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
