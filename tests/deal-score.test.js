const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDealScore, getDefaultEligibility } = require('../lib/deal-score.js');

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
