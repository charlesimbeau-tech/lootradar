'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAlertSnapshot,
  validateAlertSnapshot
} = require('../lib/alert-snapshot.js');

const BASE_UPDATED_AT = '2026-07-27T18:01:07.921Z';
const ENRICHED_UPDATED_AT = '2026-07-27T18:01:37.000Z';

function sourcePair() {
  return {
    base: {
      updatedAt: BASE_UPDATED_AT,
      dealCount: 24,
      deals: Array.from({ length: 24 }, (_, index) => ({ dealID: `raw-${index}` }))
    },
    enriched: {
      updatedAt: ENRICHED_UPDATED_AT,
      coverage: { totalDeals: 24 }
    }
  };
}

function rankedDeal(index, overrides = {}) {
  return {
    key: `steam:${index}`,
    title: `Qualified Game ${String(index).padStart(2, '0')}`,
    salePrice: 5 + index,
    normalPrice: 50,
    storeName: 'Steam',
    dealID: `deal-${index}`,
    dealScore: 80 - index,
    recommendation: `Recommendation ${index}`,
    eligible: true,
    ...overrides
  };
}

function datasetWithSpecialCases() {
  const deals = Array.from({ length: 21 }, (_, index) => rankedDeal(index + 1));
  deals.push(rankedDeal(30, {
    key: 'steam:duplicate',
    title: 'Duplicate Game',
    salePrice: 9,
    dealScore: 92,
    dealID: 'higher-price'
  }));
  deals.push(rankedDeal(31, {
    key: 'steam:duplicate',
    title: 'Duplicate Game',
    salePrice: 3,
    dealScore: 86,
    dealID: 'lowest-price'
  }));
  deals.push(rankedDeal(32, {
    key: 'steam:free',
    title: 'Free Game',
    salePrice: 0,
    normalPrice: 19.99,
    dealScore: 88
  }));
  deals.push(rankedDeal(33, {
    key: 'steam:ineligible',
    title: 'Ineligible Game',
    dealScore: 99,
    eligible: false
  }));
  return deals;
}

test('builds a deterministic quality-qualified snapshot with lowest-price deduplication', () => {
  const { base, enriched } = sourcePair();
  const buildDataset = (actualBase, actualEnriched, actualConfig) => {
    assert.equal(actualBase, base);
    assert.equal(actualEnriched, enriched);
    assert.deepEqual(actualConfig, { thresholds: { minDealScore: 55 } });
    return datasetWithSpecialCases();
  };

  const snapshot = buildAlertSnapshot(base, enriched, {
    buildDataset,
    config: { thresholds: { minDealScore: 55 } }
  });

  assert.equal(snapshot.snapshotId, ENRICHED_UPDATED_AT);
  assert.equal(snapshot.updatedAt, ENRICHED_UPDATED_AT);
  assert.equal(snapshot.source, 'CheapShark-derived LootRadar quality snapshot');
  assert.equal(snapshot.qualifiedDealCount, 23);
  assert.equal(snapshot.deals.some(deal => deal.gameKey === 'steam:ineligible'), false);

  const duplicate = snapshot.deals.find(deal => deal.gameKey === 'steam:duplicate');
  assert.equal(duplicate.salePrice, 3);
  assert.equal(duplicate.dealId, 'lowest-price');

  const free = snapshot.deals.find(deal => deal.gameKey === 'steam:free');
  assert.equal(free.free, true);

  assert.deepEqual(
    snapshot.deals.map(deal => deal.title),
    [...snapshot.deals]
      .sort((a, b) => b.dealScore - a.dealScore || a.title.localeCompare(b.title))
      .map(deal => deal.title)
  );
  assert.doesNotThrow(() => validateAlertSnapshot(snapshot));
});

test('title breaks equal Deal Scores deterministically', () => {
  const { base, enriched } = sourcePair();
  const ranked = Array.from({ length: 20 }, (_, index) => rankedDeal(index + 1));
  ranked[0] = rankedDeal(100, { title: 'Zulu', dealScore: 90 });
  ranked[1] = rankedDeal(101, { title: 'Alpha', dealScore: 90 });

  const snapshot = buildAlertSnapshot(base, enriched, {
    buildDataset: () => ranked,
    config: {}
  });

  assert.deepEqual(snapshot.deals.slice(0, 2).map(deal => deal.title), ['Alpha', 'Zulu']);
});

test('rejects malformed, mismatched, and unsafe snapshot inputs', () => {
  const { base, enriched } = sourcePair();
  const ranked = Array.from({ length: 20 }, (_, index) => rankedDeal(index + 1));

  assert.throws(
    () => buildAlertSnapshot(base, { ...enriched, updatedAt: 'not-a-date' }, {
      buildDataset: () => ranked,
      config: {}
    }),
    /timestamp/i
  );
  assert.throws(
    () => buildAlertSnapshot(base, {
      ...enriched,
      coverage: { totalDeals: base.dealCount - 1 }
    }, {
      buildDataset: () => ranked,
      config: {}
    }),
    /deal count/i
  );
  assert.throws(
    () => buildAlertSnapshot(base, enriched, {
      buildDataset: () => ranked.slice(0, 19),
      config: {}
    }),
    /at least 20/i
  );
  assert.throws(
    () => buildAlertSnapshot(base, enriched, {
      buildDataset: () => [
        ...ranked.slice(0, 19),
        rankedDeal(99, { dealID: '../unsafe' })
      ],
      config: {}
    }),
    /unsafe deal ID/i
  );
});

test('snapshot validation rejects duplicate keys and non-finite numeric fields', () => {
  const { base, enriched } = sourcePair();
  const snapshot = buildAlertSnapshot(base, enriched, {
    buildDataset: () => Array.from({ length: 20 }, (_, index) => rankedDeal(index + 1)),
    config: {}
  });

  assert.throws(
    () => validateAlertSnapshot({
      ...snapshot,
      qualifiedDealCount: snapshot.qualifiedDealCount + 1,
      deals: [...snapshot.deals, snapshot.deals[0]]
    }),
    /duplicate game key/i
  );
  assert.throws(
    () => validateAlertSnapshot({
      ...snapshot,
      deals: snapshot.deals.map((deal, index) => (
        index === 0 ? { ...deal, dealScore: Number.NaN } : deal
      ))
    }),
    /finite deal score/i
  );
});
