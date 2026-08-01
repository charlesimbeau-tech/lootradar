'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const { gamePageRoute, selectGamePageDeals } = require('../lib/game-pages.js');
const config = require('../config/editorial-config.js');
const { renderGameHub, renderGamePage } = require('./templates/game-page.js');
const root = path.resolve(__dirname, '..');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

const RELATED_COUNT = 4;

// Genre neighbours give crawlers a path into the long tail and give readers a
// reason to keep going. Falls back to score neighbours when genres are missing.
//
// Those links have to be spread rather than concentrated. Taking the top four
// by Deal Score pointed every page in a genre at the same four destinations, so
// a few pages collected hundreds of inbound links while 273 of 370 collected
// none at all. A page reachable only from the sitemap gets crawled rarely and
// ranks poorly, which defeats the point of publishing one page per game.
//
// So walk a deterministic ring instead: rank the neighbourhood, find where this
// deal sits, and link to the ones that follow it, wrapping at the end. Coverage
// spreads across the whole neighbourhood, and the ordering is stable, which
// matters because these pages rebuild eight times a day and churn shows up as
// git noise.
function relatedFor(deal, pool) {
  const genres = new Set(deal.genres || []);
  const others = pool.filter(item => item.key !== deal.key);
  const sameGenre = genres.size
    ? others.filter(item => (item.genres || []).some(genre => genres.has(genre)))
    : [];
  const neighbours = sameGenre.length >= RELATED_COUNT ? sameGenre : others;
  if (!neighbours.length) return [];

  // Rank with this deal included so its position in the ring is well defined.
  // Key breaks ties so equal scores cannot reorder between builds.
  const ring = [...neighbours, deal].sort(
    (a, b) => Number(b.dealScore) - Number(a.dealScore) ||
      String(a.key).localeCompare(String(b.key))
  );
  const start = ring.findIndex(item => item.key === deal.key);
  const picks = [];
  for (let step = 1; picks.length < RELATED_COUNT && step < ring.length; step += 1) {
    picks.push(ring[(start + step) % ring.length]);
  }
  return picks;
}
function buildGamePages(options = {}) {
  const outputDir = path.resolve(options.outputDir || path.join(root, 'games'));
  const snapshot = options.snapshot || options.base || readJSON(path.join(root, 'deals.json'));
  const deals = options.deals || buildDealDataset(
    options.base || snapshot,
    options.enriched || readJSON(path.join(root, 'enriched-deals.json')),
    options.config || config
  );
  const selected = selectGamePageDeals(deals, options.limit);
  fs.mkdirSync(outputDir, { recursive: true });

  const keep = new Set(['index.html', ...selected.map(gamePageRoute)]);
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.html') && !keep.has(file)) fs.unlinkSync(path.join(outputDir, file));
  }

  // Rewriting a page whose content is byte-identical only creates git churn,
  // and these are regenerated eight times a day.
  let written = 0;
  const writeIfChanged = (file, contents) => {
    const target = path.join(outputDir, file);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === contents) return;
    fs.writeFileSync(target, contents);
    written += 1;
  };

  const related = new Map(selected.map(deal => [deal.key, relatedFor(deal, selected)]));

  // The ring spreads links well but cannot promise every page is reached: a
  // deal in a thinly populated genre can sit outside everyone's window. Sweep
  // up whatever is left so "no page is reachable only from the sitemap" holds
  // as an invariant rather than as a tendency.
  const inbound = new Map(selected.map(deal => [deal.key, 0]));
  for (const picks of related.values()) {
    for (const pick of picks) inbound.set(pick.key, (inbound.get(pick.key) || 0) + 1);
  }
  const byKey = new Map(selected.map(deal => [deal.key, deal]));
  for (const [key, count] of inbound) {
    if (count > 0) continue;
    // Host it on the strongest page that is not this one and does not already
    // point here. selected is ordered by Deal Score, so this favours the pages
    // most likely to be crawled often.
    const host = selected.find(candidate =>
      candidate.key !== key && !related.get(candidate.key).some(pick => pick.key === key)
    );
    if (host) related.get(host.key).push(byKey.get(key));
  }

  writeIfChanged('index.html', renderGameHub(selected, snapshot));
  for (const deal of selected) {
    writeIfChanged(gamePageRoute(deal), renderGamePage(deal, snapshot, related.get(deal.key)));
  }

  return { outputDir, selected, written, routes: ['index.html', ...selected.map(gamePageRoute)] };
}

if (require.main === module) {
  const result = buildGamePages();
  console.log(`Generated ${result.selected.length} game price checks (${result.written} files written) and the game hub.`);
}
module.exports = { buildGamePages };
