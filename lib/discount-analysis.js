'use strict';

const { gamePageRoute } = require('./game-pages.js');

const QUALITY_RATING = 80;
const QUALITY_REVIEW_COUNT = 1000;

function finite(value) {
  return Number.isFinite(Number(value));
}

function isAnalysisEligible(deal) {
  return Boolean(
    deal?.eligible &&
    !deal.excludedContent &&
    !deal.isBundle &&
    !deal.isEarlyAccess &&
    finite(deal.salePrice) &&
    finite(deal.normalPrice) &&
    finite(deal.discount) &&
    finite(deal.userRating) &&
    Number(deal.reviewCount) > 0 &&
    finite(deal.dealScore)
  );
}

function median(values) {
  const sorted = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeCohort(deals) {
  const rows = Array.isArray(deals) ? deals : [];
  const qualityBackedCount = rows.filter(deal => (
    Number(deal.userRating) >= QUALITY_RATING &&
    Number(deal.reviewCount) >= QUALITY_REVIEW_COUNT
  )).length;
  return {
    count: rows.length,
    qualityBackedCount,
    qualityBackedShare: rows.length
      ? Math.round((qualityBackedCount / rows.length) * 100)
      : null,
    medianRating: median(rows.map(deal => deal.userRating)),
    medianDealScore: median(rows.map(deal => deal.dealScore))
  };
}

function analyzeDiscountCohorts(deals) {
  const analyzed = (Array.isArray(deals) ? deals : []).filter(isAnalysisEligible);
  return {
    analyzedCount: analyzed.length,
    deepDiscount: summarizeCohort(
      analyzed.filter(deal => Number(deal.discount) >= 90)
    ),
    comparison: summarizeCohort(
      analyzed.filter(deal => Number(deal.discount) >= 50 && Number(deal.discount) < 90)
    )
  };
}

function selectDeepDiscountExamples(deals, limit = 3) {
  return (Array.isArray(deals) ? deals : [])
    .filter(deal => (
      isAnalysisEligible(deal) &&
      Number(deal.discount) >= 90 &&
      gamePageRoute(deal)
    ))
    .sort((a, b) => (
      Number(b.dealScore) - Number(a.dealScore) ||
      Number(b.reviewCount) - Number(a.reviewCount) ||
      String(a.title).localeCompare(String(b.title))
    ))
    .slice(0, Math.max(0, Number(limit) || 0));
}

module.exports = {
  QUALITY_RATING,
  QUALITY_REVIEW_COUNT,
  analyzeDiscountCohorts,
  isAnalysisEligible,
  median,
  selectDeepDiscountExamples,
  summarizeCohort
};
