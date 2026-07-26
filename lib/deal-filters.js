(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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

  function matchesCollection(deal, collection) {
    switch (collection) {
      case 'under10': return deal.salePrice <= 10 && deal.userRating >= 80 && deal.reviewCount >= 100;
      case 'deep': return deal.discount >= 70 && deal.dealScore >= 65;
      case 'indie': return deal.isIndie && deal.dealScore >= 55;
      case 'multiplayer': return deal.isMultiplayer && deal.dealScore >= 55;
      case 'hidden': return deal.userRating >= 85 && deal.reviewCount >= 100 && deal.reviewCount < 5000 && deal.dealScore >= 60;
      case 'all': return true;
      case 'best':
      default: return deal.eligible && deal.dealScore >= 55;
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
      if (!matchesCollection(deal, filters.collection)) return false;
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
      release: (a, b) => (b.releaseYear || 0) - (a.releaseYear || 0),
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
    Object.keys(filters).forEach(key => {
      if (filters[key] !== DEFAULT_FILTERS[key] && filters[key] !== '' && filters[key] != null) {
        params.set(key, String(filters[key] === true ? 1 : filters[key]));
      }
    });
    return params;
  }

  return { DEFAULT_FILTERS, normalizeFilters, filterDeals, sortDeals, readFiltersFromUrl, filtersToSearchParams, matchesCollection };
});
