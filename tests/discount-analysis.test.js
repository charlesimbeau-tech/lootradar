const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeDiscountCohorts,
  isAnalysisEligible,
  median,
  selectDeepDiscountExamples
} = require('../lib/discount-analysis.js');

function deal(overrides = {}) {
  return {
    title: 'Example game',
    eligible: true,
    excludedContent: false,
    isBundle: false,
    isEarlyAccess: false,
    salePrice: 4.99,
    normalPrice: 49.99,
    discount: 90,
    userRating: 84,
    reviewCount: 2400,
    dealScore: 86,
    steamAppID: '123',
    genres: ['Action'],
    ...overrides
  };
}

test('analysis eligibility keeps complete game listings and rejects unsafe rows', () => {
  assert.equal(isAnalysisEligible(deal()), true);
  assert.equal(isAnalysisEligible(deal({ eligible: false })), false);
  assert.equal(isAnalysisEligible(deal({ excludedContent: true })), false);
  assert.equal(isAnalysisEligible(deal({ isBundle: true })), false);
  assert.equal(isAnalysisEligible(deal({ salePrice: Number.NaN })), false);
  assert.equal(isAnalysisEligible(deal({ reviewCount: 0 })), false);
});

test('median handles odd, even, and empty collections', () => {
  assert.equal(median([7, 1, 4]), 4);
  assert.equal(median([9, 3, 5, 1]), 4);
  assert.equal(median([]), null);
});

test('discount analysis compares deep discounts with the next discount band', () => {
  const result = analyzeDiscountCohorts([
    deal({ title: 'A', discount: 95, userRating: 92, reviewCount: 5000, dealScore: 91 }),
    deal({ title: 'B', discount: 90, userRating: 72, reviewCount: 900, dealScore: 70 }),
    deal({ title: 'C', discount: 70, userRating: 88, reviewCount: 4000, dealScore: 84 }),
    deal({ title: 'D', discount: 60, userRating: 79, reviewCount: 3000, dealScore: 76 }),
    deal({ title: 'Ignored', discount: 99, eligible: false })
  ]);

  assert.equal(result.analyzedCount, 4);
  assert.deepEqual(result.deepDiscount, {
    count: 2,
    qualityBackedCount: 1,
    qualityBackedShare: 50,
    medianRating: 82,
    medianDealScore: 80.5
  });
  assert.deepEqual(result.comparison, {
    count: 2,
    qualityBackedCount: 1,
    qualityBackedShare: 50,
    medianRating: 83.5,
    medianDealScore: 80
  });
});

test('discount analysis returns neutral metrics for an empty snapshot', () => {
  assert.deepEqual(analyzeDiscountCohorts([]), {
    analyzedCount: 0,
    deepDiscount: {
      count: 0,
      qualityBackedCount: 0,
      qualityBackedShare: null,
      medianRating: null,
      medianDealScore: null
    },
    comparison: {
      count: 0,
      qualityBackedCount: 0,
      qualityBackedShare: null,
      medianRating: null,
      medianDealScore: null
    }
  });
});

test('deep-discount examples favor stronger evidence and require a permanent route', () => {
  const examples = selectDeepDiscountExamples([
    deal({ title: 'Lower score', dealScore: 80, reviewCount: 9000 }),
    deal({ title: 'Best evidence', dealScore: 93, reviewCount: 4000, steamAppID: '999' }),
    deal({ title: 'No route', dealScore: 99, steamAppID: '' })
  ], 2);

  assert.deepEqual(examples.map(item => item.title), ['Best evidence', 'Lower score']);
});
