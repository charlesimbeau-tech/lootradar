(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarAlertSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCE_NAME = 'CheapShark-derived LootRadar quality snapshot';
  const MINIMUM_QUALIFIED_DEALS = 20;
  const MAX_SOURCE_TIMESTAMP_GAP_MS = 60 * 60 * 1000;
  const SAFE_DEAL_ID = /^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/;

  function timestamp(value, label) {
    if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
      throw new Error(`${label} must be a valid timestamp.`);
    }
    return Date.parse(value);
  }

  function validateSourcePair(base, enriched) {
    if (!base || typeof base !== 'object' || !enriched || typeof enriched !== 'object') {
      throw new Error('Base and enriched deal sources are required.');
    }

    const baseTime = timestamp(base.updatedAt, 'Base source timestamp');
    const enrichedTime = timestamp(enriched.updatedAt, 'Enriched source timestamp');
    if (enrichedTime < baseTime || enrichedTime - baseTime > MAX_SOURCE_TIMESTAMP_GAP_MS) {
      throw new Error('Base and enriched source timestamps do not describe the same refresh.');
    }

    const baseDeals = Array.isArray(base.deals) ? base.deals.length : null;
    const declaredBaseCount = Number(base.dealCount);
    if (
      baseDeals === null ||
      !Number.isInteger(declaredBaseCount) ||
      declaredBaseCount !== baseDeals
    ) {
      throw new Error('Base source deal count does not match its deal rows.');
    }

    const enrichedCount = Number(enriched?.coverage?.totalDeals);
    if (!Number.isInteger(enrichedCount) || enrichedCount !== declaredBaseCount) {
      throw new Error('Enriched source deal count does not match the base source.');
    }
  }

  function isSafeDealId(value) {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 256 &&
      SAFE_DEAL_ID.test(value)
    );
  }

  function normalizeGenres(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const genres = [];
    for (const raw of value) {
      if (typeof raw !== 'string') continue;
      const genre = raw.normalize('NFKC').trim();
      if (!genre || genre.length > 80 || /[\u0000-\u001f\u007f]/.test(genre)) continue;
      const key = genre.toLocaleLowerCase('en');
      if (seen.has(key)) continue;
      seen.add(key);
      genres.push(genre);
      if (genres.length === 20) break;
    }
    return genres;
  }

  function validateAlertSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Alert snapshot must be an object.');
    }
    timestamp(snapshot.snapshotId, 'Alert snapshot ID');
    timestamp(snapshot.updatedAt, 'Alert snapshot updatedAt');
    if (snapshot.snapshotId !== snapshot.updatedAt) {
      throw new Error('Alert snapshot ID must equal updatedAt.');
    }
    if (snapshot.source !== SOURCE_NAME) {
      throw new Error('Alert snapshot source is invalid.');
    }
    if (!Array.isArray(snapshot.deals)) {
      throw new Error('Alert snapshot deals must be an array.');
    }
    if (
      !Number.isInteger(snapshot.qualifiedDealCount) ||
      snapshot.qualifiedDealCount !== snapshot.deals.length
    ) {
      throw new Error('Alert snapshot qualified deal count does not match its deal rows.');
    }
    if (snapshot.deals.length < MINIMUM_QUALIFIED_DEALS) {
      throw new Error(`Alert snapshot requires at least ${MINIMUM_QUALIFIED_DEALS} qualified deals.`);
    }

    const gameKeys = new Set();
    for (const deal of snapshot.deals) {
      if (!deal || typeof deal !== 'object') {
        throw new Error('Alert snapshot contains an invalid deal.');
      }
      if (typeof deal.gameKey !== 'string' || !deal.gameKey.trim()) {
        throw new Error('Alert snapshot contains an invalid game key.');
      }
      if (gameKeys.has(deal.gameKey)) {
        throw new Error(`Alert snapshot contains duplicate game key: ${deal.gameKey}`);
      }
      gameKeys.add(deal.gameKey);

      if (typeof deal.title !== 'string' || !deal.title.trim()) {
        throw new Error(`Alert snapshot contains an invalid title for ${deal.gameKey}.`);
      }
      if (typeof deal.storeName !== 'string' || !deal.storeName.trim()) {
        throw new Error(`Alert snapshot contains an invalid store for ${deal.gameKey}.`);
      }
      if (typeof deal.recommendation !== 'string' || !deal.recommendation.trim()) {
        throw new Error(`Alert snapshot contains an invalid recommendation for ${deal.gameKey}.`);
      }
      if (!Array.isArray(deal.genres) || deal.genres.length > 20) {
        throw new Error(`Alert snapshot contains invalid genres for ${deal.gameKey}.`);
      }
      const normalizedGenres = normalizeGenres(deal.genres);
      if (
        normalizedGenres.length !== deal.genres.length ||
        normalizedGenres.some((genre, index) => genre !== deal.genres[index])
      ) {
        throw new Error(`Alert snapshot contains invalid genres for ${deal.gameKey}.`);
      }
      if (!Number.isFinite(deal.salePrice) || deal.salePrice < 0) {
        throw new Error(`Alert snapshot requires a finite sale price for ${deal.gameKey}.`);
      }
      if (!Number.isFinite(deal.normalPrice) || deal.normalPrice < 0) {
        throw new Error(`Alert snapshot requires a finite normal price for ${deal.gameKey}.`);
      }
      if (!Number.isFinite(deal.dealScore)) {
        throw new Error(`Alert snapshot requires a finite deal score for ${deal.gameKey}.`);
      }
      if (!isSafeDealId(deal.dealId)) {
        throw new Error(`Alert snapshot contains an unsafe deal ID for ${deal.gameKey}.`);
      }
      if (typeof deal.free !== 'boolean' || deal.free !== (deal.salePrice === 0)) {
        throw new Error(`Alert snapshot contains an invalid free flag for ${deal.gameKey}.`);
      }
    }

    return snapshot;
  }

  function buildAlertSnapshot(base, enriched, options = {}) {
    const { buildDataset, config } = options;
    if (typeof buildDataset !== 'function') {
      throw new TypeError('buildAlertSnapshot requires a buildDataset function.');
    }
    validateSourcePair(base, enriched);

    const ranked = buildDataset(base, enriched, config);
    if (!Array.isArray(ranked)) {
      throw new TypeError('buildDataset must return an array.');
    }

    const byGame = new Map();
    for (const deal of ranked.filter(item => item?.eligible)) {
      const item = {
        gameKey: deal.key,
        title: deal.title,
        salePrice: Number(deal.salePrice),
        normalPrice: Number(deal.normalPrice),
        storeName: deal.storeName,
        dealId: deal.dealID,
        dealScore: Number(deal.dealScore),
        recommendation: deal.recommendation,
        genres: normalizeGenres(deal.genres),
        free: Number(deal.salePrice) === 0
      };
      const current = byGame.get(item.gameKey);
      if (!current || item.salePrice < current.salePrice) {
        byGame.set(item.gameKey, item);
      }
    }

    const deals = [...byGame.values()].sort((a, b) => (
      b.dealScore - a.dealScore ||
      a.title.localeCompare(b.title) ||
      a.gameKey.localeCompare(b.gameKey)
    ));
    return validateAlertSnapshot({
      snapshotId: enriched.updatedAt,
      updatedAt: enriched.updatedAt,
      source: SOURCE_NAME,
      qualifiedDealCount: deals.length,
      deals
    });
  }

  return {
    SOURCE_NAME,
    MINIMUM_QUALIFIED_DEALS,
    buildAlertSnapshot,
    isSafeDealId,
    normalizeGenres,
    validateAlertSnapshot,
    validateSourcePair
  };
});
