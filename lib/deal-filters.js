(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A recent release cannot have years of reviews behind it, so this collection
  // trades review volume for recency and states the trade on the page.
  const FRESH = Object.freeze({
    windowDays: 365,
    minRating: 80,
    minReviews: 500,
    minDealScore: 55
  });

  // The general eligibility floor is 55 ("Worth a look"). Best right now is
  // deliberately narrower and begins at the existing "Great deal" boundary.
  const BEST = Object.freeze({
    minDealScore: 75
  });

  const DAY_MS = 86400000;

  function releaseTime(deal) {
    if (deal && deal.releaseDate) {
      const parsed = new Date(deal.releaseDate).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
    if (deal && Number.isFinite(Number(deal.releaseYear))) {
      return Date.UTC(Number(deal.releaseYear), 0, 1);
    }
    return null;
  }

  function releaseAgeInDays(deal, now = Date.now()) {
    const released = releaseTime(deal);
    if (released === null) return null;
    return Math.floor((Number(now) - released) / DAY_MS);
  }

  // Shared by the homepage collection and the permanent landing page so both
  // pages describe the same set.
  function isFreshRelease(deal, now = Date.now()) {
    const age = releaseAgeInDays(deal, now);
    if (age === null || age < 0 || age > FRESH.windowDays) return false;
    return Number(deal.userRating) >= FRESH.minRating &&
      Number(deal.reviewCount) >= FRESH.minReviews &&
      Number(deal.dealScore) >= FRESH.minDealScore;
  }

  const DEFAULT_FILTERS = Object.freeze({
    q: '',
    collection: 'best',
    sort: 'recommended',
    store: 'all',
    genre: 'all',
    maxPrice: 70,
    minDiscount: 0,
    minRating: 70,
    minReviews: 100,
    quality: 'recommended',
    includeDlc: false,
    includeEarlyAccess: false,
    includeBundles: false
  });

  function normalizeFilters(input = {}) {
    const filters = { ...DEFAULT_FILTERS, ...input };
    ['maxPrice', 'minDiscount', 'minRating', 'minReviews'].forEach(key => {
      const value = Number(filters[key]);
      filters[key] = Number.isFinite(value) ? value : DEFAULT_FILTERS[key];
    });
    ['includeDlc', 'includeEarlyAccess', 'includeBundles'].forEach(key => {
      filters[key] = filters[key] === true || filters[key] === '1' || filters[key] === 'true';
    });
    return filters;
  }

  // Older shared homepage URLs can still name collection chips that are now
  // represented by the real filter controls. Convert them into those controls
  // so old links remain useful without restoring duplicated UI.
  function consolidateHomepageFilters(input = {}) {
    const filters = normalizeFilters(input);
    if (filters.collection === 'under10') {
      return {
        ...filters,
        collection: 'all',
        maxPrice: Math.min(filters.maxPrice, 10),
        minRating: Math.max(filters.minRating, 80),
        minReviews: Math.max(filters.minReviews, 100)
      };
    }
    if (filters.collection === 'deep') {
      return { ...filters, collection: 'all', minDiscount: Math.max(filters.minDiscount, 70) };
    }
    if (filters.collection === 'indie') {
      return { ...filters, collection: 'all', genre: 'Indie' };
    }
    return filters;
  }

  function matchesCollection(deal, collection, now = Date.now()) {
    switch (collection) {
      case 'under10': return deal.salePrice <= 10 && deal.userRating >= 80 && deal.reviewCount >= 100;
      case 'fresh': return isFreshRelease(deal, now);
      case 'deep': return deal.discount >= 70 && deal.dealScore >= 65;
      case 'indie': return deal.isIndie && deal.dealScore >= 55;
      case 'multiplayer': return deal.isMultiplayer && deal.dealScore >= 55;
      case 'hidden': return deal.userRating >= 85 && deal.reviewCount >= 100 && deal.reviewCount < 5000 && deal.dealScore >= 60;
      case 'all': return true;
      case 'best':
      default: return deal.eligible && Number(deal.dealScore) >= BEST.minDealScore;
    }
  }

  function filterDeals(deals, input = {}) {
    const filters = normalizeFilters(input);
    const query = filters.q.trim().toLowerCase();
    return deals.filter(deal => {
      if (!filters.includeDlc && deal.excludedContent) return false;
      if (!filters.includeEarlyAccess && deal.isEarlyAccess) return false;
      if (!filters.includeBundles && deal.isBundle) return false;
      if (filters.quality === 'recommended' && !deal.eligible) return false;
      if (filters.store !== 'all' && deal.storeID !== filters.store) return false;
      if (filters.genre !== 'all' && !(deal.genres || []).includes(filters.genre)) return false;
      if (deal.salePrice > filters.maxPrice) return false;
      if (deal.discount < filters.minDiscount) return false;
      if (deal.userRating > 0 && deal.userRating < filters.minRating) return false;
      if (deal.reviewCount > 0 && deal.reviewCount < filters.minReviews) return false;
      if (!matchesCollection(deal, filters.collection, input.now)) return false;
      if (query) {
        const searchable = [deal.title, deal.storeName, ...(deal.genres || []), ...(deal.tags || [])].join(' ').toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
  }

  function sortDeals(deals, sort = 'recommended') {
    const copy = [...deals];
    const by = {
      recommended: (a, b) => b.dealScore - a.dealScore || b.reviewCount - a.reviewCount,
      score: (a, b) => b.dealScore - a.dealScore,
      reviewed: (a, b) => b.userRating - a.userRating || b.reviewCount - a.reviewCount,
      price: (a, b) => a.salePrice - b.salePrice,
      discount: (a, b) => b.discount - a.discount || b.dealScore - a.dealScore,
      history: (a, b) => b.scoreBreakdown.components.priceValue - a.scoreBreakdown.components.priceValue,
      release: (a, b) => (releaseTime(b) ?? 0) - (releaseTime(a) ?? 0),
      popular: (a, b) => b.reviewCount - a.reviewCount,
      added: (a, b) => (b.raw.lastChange || 0) - (a.raw.lastChange || 0)
    };
    return copy.sort(by[sort] || by.recommended);
  }

  function readFiltersFromUrl(url) {
    const parsed = typeof url === 'string' ? new URL(url, 'https://thelootradar.com') : url;
    const input = {};
    for (const [key, value] of parsed.searchParams.entries()) input[key] = value;
    if (input.q == null && parsed.searchParams.has('search')) input.q = parsed.searchParams.get('search');
    return normalizeFilters(input);
  }

  function filtersToSearchParams(input) {
    const filters = normalizeFilters(input);
    const params = new URLSearchParams();
    // Only known filters belong in a shareable URL; anything else a caller
    // passed through (a clock override, a stray query param) stays out.
    Object.keys(DEFAULT_FILTERS).forEach(key => {
      if (filters[key] !== DEFAULT_FILTERS[key] && filters[key] !== '' && filters[key] != null) {
        params.set(key, String(filters[key] === true ? 1 : filters[key]));
      }
    });
    return params;
  }

  return {
    DEFAULT_FILTERS,
    BEST,
    FRESH,
    normalizeFilters,
    consolidateHomepageFilters,
    filterDeals,
    sortDeals,
    readFiltersFromUrl,
    filtersToSearchParams,
    matchesCollection,
    isFreshRelease,
    releaseAgeInDays
  };
});
