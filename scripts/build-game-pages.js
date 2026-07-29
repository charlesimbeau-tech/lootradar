'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const { gamePageRoute, selectGamePageDeals } = require('../lib/game-pages.js');
const config = require('../config/editorial-config.js');
const { renderGameHub, renderGamePage } = require('./templates/game-page.js');
const root = path.resolve(__dirname, '..');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
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
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.html')) fs.unlinkSync(path.join(outputDir, file));
  }
  fs.writeFileSync(path.join(outputDir, 'index.html'), renderGameHub(selected, snapshot));
  for (const deal of selected) {
    fs.writeFileSync(path.join(outputDir, gamePageRoute(deal)), renderGamePage(deal, snapshot));
  }
  return { outputDir, selected, routes: ['index.html', ...selected.map(gamePageRoute)] };
}

if (require.main === module) {
  const result = buildGamePages();
  console.log(`Generated ${result.selected.length} game price checks and the game hub.`);
}
module.exports = { buildGamePages };
