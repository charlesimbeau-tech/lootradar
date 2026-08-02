const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateDealScore,
  createRecommendationReason,
  getDefaultEligibility
} = require('../lib/deal-score.js');

const excellent = {
  userRating: 94, reviewCount: 48000, criticScore: 90, discount: 60,
  dealRating: 9.2, salePrice: 19.99, normalPrice: 49.99, releaseYear: 2023
};
const mediocre = {
  userRating: 58, reviewCount: 220, criticScore: 52, discount: 90,
  dealRating: 7.5, salePrice: 1.99, normalPrice: 19.99, releaseYear: 2022
};
const modest = {
  userRating: 97, reviewCount: 180000, criticScore: 93, discount: 25,
  dealRating: 8.6, salePrice: 44.99, normalPrice: 59.99, releaseYear: 2024
};

test('an acclaimed strong deal outranks a mediocre 90%-off game', () => {
  assert.ok(calculateDealScore(excellent).score > calculateDealScore(mediocre).score);
});

test('a highly rated modest discount can remain a strong recommendation', () => {
  assert.ok(calculateDealScore(modest).score >= 70);
  assert.ok(calculateDealScore(modest).score > calculateDealScore(mediocre).score);
});

test('historical-low data improves price-value transparency', () => {
  const atLow = calculateDealScore({ ...excellent, salePrice: 19.99, historicalLow: 19.99 });
  const aboveLow = calculateDealScore({ ...excellent, salePrice: 29.99, historicalLow: 19.99 });
  assert.equal(atLow.components.priceValue, 100);
  assert.ok(atLow.score > aboveLow.score);
});

test('default eligibility rejects mixed reviews and non-game content', () => {
  assert.equal(getDefaultEligibility(mediocre).eligible, false);
  assert.equal(getDefaultEligibility({ ...excellent, excludedContent: true, contentTypes: ['dlc'] }).eligible, false);
});

test('recommendation reason uses a factual stat line with uppercase compact counts', () => {
  assert.equal(
    createRecommendationReason({
      userRating: 86,
      reviewCount: 45900,
      discount: 90,
      salePrice: 4.99,
      normalPrice: 49.99
    }),
    '86% positive · 45.9K reviews · 90% off'
  );
});

test('recommendation reason states recorded-low evidence directly', () => {
  assert.equal(
    createRecommendationReason({
      userRating: 94,
      reviewCount: 48000,
      discount: 60,
      salePrice: 19.99,
      historicalLow: 19.99
    }),
    '94% positive · 48K reviews · Recorded low'
  );
  assert.equal(
    createRecommendationReason({
      userRating: 94,
      reviewCount: 48000,
      discount: 40,
      salePrice: 22.14,
      historicalLow: 19.99
    }),
    '94% positive · 48K reviews · $2.15 above recorded low'
  );
});

test('recommendation reason describes limited rating evidence without commentary', () => {
  assert.equal(
    createRecommendationReason({ criticScore: 82, discount: 70 }),
    'Critic score 82 · Player rating unavailable'
  );
  assert.equal(
    createRecommendationReason({ discount: 90 }),
    '90% off · Rating data unavailable'
  );
  assert.equal(createRecommendationReason({}), 'Rating data unavailable');
});
