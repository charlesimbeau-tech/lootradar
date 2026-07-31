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
function relatedFor(deal, pool) {
  const genres = new Set(deal.genres || []);
  const others = pool.filter(item => item.key !== deal.key);
  const sameGenre = genres.size
    ? others.filter(item => (item.genres || []).some(genre => genres.has(genre)))
    : [];
  const ranked = (sameGenre.length >= RELATED_COUNT ? sameGenre : others)
    .slice()
    .sort((a, b) => Number(b.dealScore) - Number(a.dealScore));
  return ranked.slice(0, RELATED_COUNT);
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

  writeIfChanged('index.html', renderGameHub(selected, snapshot));
  for (const deal of selected) {
    writeIfChanged(gamePageRoute(deal), renderGamePage(deal, snapshot, relatedFor(deal, selected)));
  }

  return { outputDir, selected, written, routes: ['index.html', ...selected.map(gamePageRoute)] };
}

if (require.main === module) {
  const result = buildGamePages();
  console.log(`Generated ${result.selected.length} game price checks (${result.written} files written) and the game hub.`);
}
module.exports = { buildGamePages };
