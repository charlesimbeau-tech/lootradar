(function (root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  if (root) root.LootRadarEditorialConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return Object.freeze({
    version: '1.0.0',
    weights: Object.freeze({
      quality: 35,
      priceValue: 25,
      discount: 20,
      confidence: 10,
      interest: 10
    }),
    thresholds: Object.freeze({
      minUserRating: 70,
      minReviewCount: 100,
      minDiscount: 15,
      minDealScore: 55
    }),
    penalties: Object.freeze({
      noReliableQualityData: 18,
      reviewsUnder10: 22,
      reviewsUnder50: 12,
      reviewsUnder100: 5,
      userRatingUnder50: 25,
      userRatingUnder70: 12,
      excludedContent: 60,
      spamLikeTitle: 15,
      suspiciousListPrice: 10,
      weakDiscount: 6,
      earlyAccessRisk: 4
    }),
    excludedGames: Object.freeze([]),
    excludedPublishers: Object.freeze([]),
    trustedPublishers: Object.freeze([
      'Annapurna Interactive',
      'Capcom',
      'Devolver Digital',
      'Humble Games',
      'Nintendo',
      'PlayStation Publishing',
      'SEGA',
      'Supergiant Games',
      'Xbox Game Studios'
    ]),
    featuredGameIds: Object.freeze([]),
    collections: Object.freeze([
      { id: 'best', label: 'Best right now' },
      { id: 'free', label: 'Free today' },
      { id: 'five', label: '$5 finds' },
      { id: 'fresh', label: 'New arrivals' },
      { id: 'hidden', label: 'Hidden gems' }
    ])
  });
});
