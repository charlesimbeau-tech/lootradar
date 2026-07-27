(function (root, factory) {
  const normalizer = typeof module === 'object' && module.exports
    ? require('./deal-normalizer.js')
    : root && root.LootRadarNormalizer;
  const scoring = typeof module === 'object' && module.exports
    ? require('./deal-score.js')
    : root && root.LootRadarScoring;
  const api = factory(normalizer, scoring);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarDataset = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (normalizer, scoring) {
  'use strict';

  if (!normalizer || !scoring) {
    throw new Error('LootRadarDataset requires the deal normalizer and scoring modules.');
  }

  const { normalizeDeal } = normalizer;
  const { calculateDealScore, createRecommendationReason, getDefaultEligibility } = scoring;

  function scoreNormalizedDeal(raw, stores, config) {
    const deal = normalizeDeal(raw, stores);
    const scoreBreakdown = calculateDealScore(deal, config);
    const eligibility = getDefaultEligibility(deal, config);
    return {
      ...deal,
      dealScore: scoreBreakdown.score,
      scoreBreakdown,
      eligible: eligibility.eligible,
      exclusionReasons: eligibility.reasons,
      recommendation: createRecommendationReason(deal, scoreBreakdown)
    };
  }

  function dedupeDeals(deals) {
    const byKey = new Map();
    for (const deal of deals) {
      const previous = byKey.get(deal.key);
      if (
        !previous ||
        deal.dealScore > previous.dealScore ||
        (deal.dealScore === previous.dealScore && deal.salePrice < previous.salePrice)
      ) {
        byKey.set(deal.key, deal);
      }
    }
    return [...byKey.values()];
  }

  function buildDealDataset(base, enriched, config) {
    const enrichedRows = enriched?.games || [];
    const byDeal = new Map(enrichedRows.filter(Boolean).map(row => [row.dealID, row]));
    const bySteam = new Map(
      enrichedRows.filter(row => row?.steamAppID).map(row => [String(row.steamAppID), row])
    );
    const rows = (base?.deals || []).map(row => {
      const metadata = byDeal.get(row.dealID) || bySteam.get(String(row.steamAppID || ''));
      return metadata ? { ...row, rawg: metadata.rawg || null } : row;
    });
    return dedupeDeals(
      rows.map(row => scoreNormalizedDeal(row, base?.stores || {}, config))
    );
  }

  return { buildDealDataset, dedupeDeals, scoreNormalizedDeal };
});
