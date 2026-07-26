(function (root, factory) {
  const api = factory(root && root.LootRadarEditorialConfig);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarScoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (browserConfig) {
  'use strict';

  const fallbackConfig = {
    weights: { quality: 35, priceValue: 25, discount: 20, confidence: 10, interest: 10 },
    thresholds: { minUserRating: 70, minReviewCount: 100, minDiscount: 15, minDealScore: 55 },
    penalties: {
      noReliableQualityData: 18, reviewsUnder10: 22, reviewsUnder50: 12, reviewsUnder100: 5,
      userRatingUnder50: 25, userRatingUnder70: 12, excludedContent: 60, spamLikeTitle: 15,
      suspiciousListPrice: 10, weakDiscount: 6, earlyAccessRisk: 4
    },
    excludedGames: [], excludedPublishers: [], trustedPublishers: [], featuredGameIds: []
  };

  function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function round(value, places = 0) {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }

  function mergeConfig(config) {
    const base = browserConfig || fallbackConfig;
    return {
      ...fallbackConfig,
      ...base,
      ...config,
      weights: { ...fallbackConfig.weights, ...(base.weights || {}), ...(config?.weights || {}) },
      thresholds: { ...fallbackConfig.thresholds, ...(base.thresholds || {}), ...(config?.thresholds || {}) },
      penalties: { ...fallbackConfig.penalties, ...(base.penalties || {}), ...(config?.penalties || {}) }
    };
  }

  function qualitySignal(deal) {
    const user = clamp(Number(deal.userRating || 0));
    const critic = clamp(Number(deal.criticScore || 0));
    if (user && critic) return user * 0.72 + critic * 0.28;
    return user || critic || 0;
  }

  function priceValueSignal(deal) {
    const sale = Number(deal.salePrice || 0);
    const historical = Number(deal.historicalLow || 0);
    if (historical > 0) {
      if (sale <= historical * 1.01) return 100;
      const premium = (sale - historical) / Math.max(historical, 5);
      return clamp(100 - premium * 75);
    }
    return clamp(Number(deal.dealRating || 0) * 10);
  }

  function discountSignal(deal) {
    const discount = clamp(Number(deal.discount || 0));
    return clamp((discount / 70) * 100);
  }

  function confidenceSignal(deal) {
    const count = Math.max(0, Number(deal.reviewCount || 0));
    if (!count) return 0;
    return clamp((Math.log10(count + 1) / Math.log10(50001)) * 100);
  }

  function interestSignal(deal) {
    const count = Math.max(0, Number(deal.reviewCount || 0));
    const popularity = clamp((Math.log10(count + 1) / Math.log10(200001)) * 100);
    const year = Number(deal.releaseYear || 0);
    const currentYear = new Date().getUTCFullYear();
    const recency = year ? clamp(100 - Math.max(0, currentYear - year) * 7) : 40;
    return popularity * 0.8 + recency * 0.2;
  }

  function calculatePenalties(deal, config) {
    const p = config.penalties;
    const applied = [];
    const add = (id, label, amount) => {
      if (amount > 0) applied.push({ id, label, amount });
    };
    const rating = Number(deal.userRating || 0);
    const critic = Number(deal.criticScore || 0);
    const reviews = Number(deal.reviewCount || 0);

    if (!rating && !critic) add('unknown-quality', 'No reliable rating data', p.noReliableQualityData);
    if (reviews > 0 && reviews < 10) add('very-low-reviews', 'Fewer than 10 user reviews', p.reviewsUnder10);
    else if (reviews > 0 && reviews < 50) add('low-reviews', 'Fewer than 50 user reviews', p.reviewsUnder50);
    else if (reviews > 0 && reviews < 100) add('limited-reviews', 'Fewer than 100 user reviews', p.reviewsUnder100);
    if (rating > 0 && rating < 50) add('negative-reviews', 'Mostly negative user sentiment', p.userRatingUnder50);
    else if (rating > 0 && rating < 70) add('mixed-reviews', 'Mixed user sentiment', p.userRatingUnder70);
    if (deal.excludedContent) add('non-game-content', `Excluded content: ${(deal.contentTypes || []).join(', ') || 'not a full game'}`, p.excludedContent);
    if (deal.spamLikeTitle) add('spam-title', 'Spam-like title pattern', p.spamLikeTitle);
    if (Number(deal.normalPrice || 0) > 75 && Number(deal.salePrice || 0) > 0 && Number(deal.normalPrice) / Number(deal.salePrice) > 25) {
      add('list-price', 'Suspicious list-price ratio', p.suspiciousListPrice);
    }
    if (Number(deal.discount || 0) < 10 && priceValueSignal(deal) < 70) add('weak-discount', 'Weak price movement', p.weakDiscount);
    if (deal.isEarlyAccess && rating > 0 && rating < 80) add('early-access', 'Lower-confidence Early Access history', p.earlyAccessRisk);
    if ((config.excludedGames || []).includes(deal.key)) add('editor-excluded', 'Manually excluded by editors', 100);
    if (deal.publisher && (config.excludedPublishers || []).includes(deal.publisher)) add('publisher-excluded', 'Publisher excluded by editors', 100);

    return applied;
  }

  function calculateDealScore(deal, customConfig) {
    const config = mergeConfig(customConfig);
    const components = {
      quality: round(qualitySignal(deal), 1),
      priceValue: round(priceValueSignal(deal), 1),
      discount: round(discountSignal(deal), 1),
      confidence: round(confidenceSignal(deal), 1),
      interest: round(interestSignal(deal), 1)
    };
    const weighted = Object.keys(components).reduce((sum, key) => {
      return sum + components[key] * (Number(config.weights[key] || 0) / 100);
    }, 0);
    const penalties = calculatePenalties(deal, config);
    const penaltyTotal = penalties.reduce((sum, item) => sum + item.amount, 0);
    const score = Math.round(clamp(weighted - penaltyTotal));
    return {
      score,
      components,
      weights: { ...config.weights },
      penalties,
      penaltyTotal,
      confidence: components.confidence >= 75 ? 'high' : components.confidence >= 45 ? 'medium' : 'limited',
      usesHistoricalLow: Number(deal.historicalLow || 0) > 0
    };
  }

  function getDefaultEligibility(deal, customConfig) {
    const config = mergeConfig(customConfig);
    const result = calculateDealScore(deal, config);
    const reasons = [];
    if (deal.excludedContent) reasons.push('not a full game');
    if (deal.spamLikeTitle) reasons.push('spam-like title');
    if (deal.userRating > 0 && deal.userRating < config.thresholds.minUserRating) reasons.push('user rating below threshold');
    if (deal.reviewCount > 0 && deal.reviewCount < config.thresholds.minReviewCount) reasons.push('review confidence below threshold');
    if (deal.discount < config.thresholds.minDiscount && result.components.priceValue < 70) reasons.push('price is not meaningfully reduced');
    if (result.score < config.thresholds.minDealScore) reasons.push('Deal Score below threshold');
    return { eligible: reasons.length === 0, reasons, scoreResult: result };
  }

  function formatCount(value) {
    const count = Number(value || 0);
    if (count >= 1000000) return `${round(count / 1000000, 1)}M`;
    if (count >= 1000) return `${round(count / 1000, 1)}k`;
    return String(count);
  }

  function createRecommendationReason(deal, result = calculateDealScore(deal)) {
    if (deal.userRating && deal.reviewCount) {
      const review = `${deal.userRating}% positive from ${formatCount(deal.reviewCount)} reviews`;
      if (result.usesHistoricalLow && deal.historicalLow) {
        const difference = Number(deal.salePrice) - Number(deal.historicalLow);
        if (difference <= 0.01) return `New or matched historical low with ${review}.`;
        return `${review} and $${difference.toFixed(2)} above its recorded low.`;
      }
      if (deal.discount >= 60) return `${review}, backed by a strong ${deal.discount}% discount.`;
      return `${review}; the discount is modest, so quality carries this pick.`;
    }
    if (deal.criticScore) return `${deal.criticScore} critic score; player-review confidence is limited.`;
    return 'Price looks competitive, but reliable quality data is limited.';
  }

  return {
    calculateDealScore,
    getDefaultEligibility,
    createRecommendationReason,
    qualitySignal,
    priceValueSignal,
    discountSignal,
    confidenceSignal,
    interestSignal,
    clamp
  };
});
