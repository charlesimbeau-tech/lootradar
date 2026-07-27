'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const { createRssFeed } = require('../lib/rss-feed.js');
const config = require('../config/editorial-config.js');

const root = path.resolve(__dirname, '..');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function generateRss(options = {}) {
  const base = options.base || readJSON(path.join(root, 'deals.json'));
  const enriched = options.enriched || readJSON(path.join(root, 'enriched-deals.json'));
  const deals = options.deals || buildDealDataset(base, enriched, options.config || config);
  const xml = createRssFeed(deals, {
    origin: options.origin || 'https://thelootradar.com',
    updatedAt: options.updatedAt || base.updatedAt,
    limit: options.limit || 20
  });
  const itemCount = (xml.match(/<item>/g) || []).length;
  if (itemCount > 20) {
    throw new Error(`RSS allows at most 20 qualified items; generated ${itemCount}.`);
  }
  const output = path.resolve(options.output || path.join(root, 'feed.xml'));
  fs.writeFileSync(output, xml);
  return { output, itemCount };
}

if (require.main === module) {
  const result = generateRss();
  console.log(`Generated ${result.itemCount} qualified RSS items in ${result.output}.`);
}

module.exports = { generateRss };
