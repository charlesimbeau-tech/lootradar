'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const { loadWeeklyIssues } = require('../lib/weekly-guide.js');
const config = require('../config/editorial-config.js');

const root = path.resolve(__dirname, '..');
const MAX_SNAPSHOT_AGE_MS = 6 * 60 * 60 * 1000;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function stableGameKey(value) {
  const key = String(value || '');
  if (/^steam:\d+$/.test(key)) return key;
  return `title:${key.replace(/^title:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function listWeeklyCandidates(options = {}) {
  const base = options.base || readJson('deals.json');
  const enriched = options.enriched || readJson('enriched-deals.json');
  const now = options.now ? new Date(options.now) : new Date();
  const updatedAt = new Date(base.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) throw new Error('deals.json has an invalid updatedAt value.');
  const snapshotAge = now.getTime() - updatedAt.getTime();
  if (snapshotAge < 0 || snapshotAge > MAX_SNAPSHOT_AGE_MS) {
    throw new Error('The deal snapshot is older than six hours. Wait for a successful refresh.');
  }

  const recentGameKeys = new Set(
    loadWeeklyIssues(root)
      .slice(-4)
      .flatMap(issue => issue.picks.map(pick => pick.gameKey))
  );
  const deals = buildDealDataset(base, enriched, config)
    .filter(deal => (
      deal.eligible &&
      !deal.excludedContent &&
      !deal.isBundle &&
      !deal.isEarlyAccess &&
      deal.salePrice > 0 &&
      deal.normalPrice >= deal.salePrice &&
      deal.userRating >= 80 &&
      deal.reviewCount >= 500 &&
      deal.image &&
      deal.dealID &&
      !recentGameKeys.has(stableGameKey(deal.key))
    ))
    .sort((left, right) => (
      right.dealScore - left.dealScore ||
      right.reviewCount - left.reviewCount ||
      left.title.localeCompare(right.title)
    ))
    .slice(0, options.limit || 40)
    .map(deal => ({
      id: deal.slug.replace(/-\d+$/, ''),
      gameKey: stableGameKey(deal.key),
      title: deal.title,
      dealScore: deal.dealScore,
      salePrice: deal.salePrice,
      normalPrice: deal.normalPrice,
      store: deal.storeName,
      trackingStore: deal.storeName.replace(/\s+/g, ''),
      imageUrl: deal.image,
      imageAlt: `${deal.title} cover art`,
      dealUrl: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`,
      reviewRating: deal.userRating,
      reviewCount: deal.reviewCount,
      discountPercent: deal.discount,
      genres: deal.genres,
      recommendation: deal.recommendation
    }));

  return {
    snapshotUpdatedAt: updatedAt.toISOString(),
    generatedAt: now.toISOString(),
    count: deals.length,
    candidates: deals
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(listWeeklyCandidates(), null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { MAX_SNAPSHOT_AGE_MS, listWeeklyCandidates, stableGameKey };
