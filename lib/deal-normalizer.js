(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarNormalizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTENT_PATTERNS = [
    { type: 'dlc', re: /\b(dlc|expansion pass|season pass|chapter pack|map pack)\b/i },
    { type: 'soundtrack', re: /\b(soundtrack|ost|music pack|digital soundtrack)\b/i },
    { type: 'demo', re: /\b(demo|prologue|playtest|benchmark)\b/i },
    { type: 'currency', re: /\b(\d+\s*(coins?|credits?|gems?|points?)|virtual currency|shark card)\b/i },
    { type: 'cosmetic', re: /\b(cosmetic|skin pack|outfit pack|costume pack)\b/i },
    { type: 'software', re: /\b(wallpaper|artbook|art book|server tool|sdk|editor)\b/i }
  ];

  const EDITION_WORDS = /\b(game of the year|goty|definitive|deluxe|ultimate|complete|collector'?s|premium|gold|standard|enhanced|remastered|remake|edition|bundle)\b/gi;
  const SPAM_PATTERNS = [
    /[!?]{3,}/,
    /\b\d{4,}\s*games?\b/i,
    /\b(super|ultimate|epic|amazing)\b(?:\s+\w+){0,2}\s+\b(simulator|clicker)\b/i,
    /(?:\bfree\b.*){2,}/i
  ];

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeTitle(value) {
    return cleanText(value)
      .replace(/[™®©]/g, '')
      .replace(EDITION_WORDS, ' ')
      .replace(/[-–—:|()[\]{}]+/g, ' ')
      .replace(/[^a-z0-9\s']/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function slugify(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'game';
  }

  function contentFlags(title, tags) {
    const haystack = `${title} ${(tags || []).join(' ')}`;
    const matches = CONTENT_PATTERNS.filter(item => item.re.test(haystack)).map(item => item.type);
    return {
      types: [...new Set(matches)],
      excluded: matches.length > 0,
      spamLike: SPAM_PATTERNS.some(pattern => pattern.test(title))
    };
  }

  // Enrichment supplies an ISO date; the pricing feed supplies unix seconds and
  // uses 0 for "unknown". Both have to end up as one comparable date string.
  function toReleaseDate(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      const parsed = new Date(seconds < 1e11 ? seconds * 1000 : seconds);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    }
    return Number.isNaN(new Date(value).getTime()) ? null : String(value);
  }

  function normalizeDeal(raw, stores = {}) {
    const metadata = raw.rawg || raw.metadata || {};
    const title = cleanText(raw.title || metadata.name || 'Unknown game');
    const genres = [...new Set([...(metadata.genres || []), ...(raw.genres || [])].map(cleanText).filter(Boolean))];
    const tags = [...new Set([...(metadata.tags || []), ...(raw.tags || [])].map(cleanText).filter(Boolean))];
    const platforms = [...new Set([...(metadata.platforms || []), ...(raw.platforms || [])].map(cleanText).filter(Boolean))];
    const flags = contentFlags(title, tags);
    const salePrice = number(raw.salePrice ?? raw.sale, 0);
    const normalPrice = number(raw.normalPrice ?? raw.normal, salePrice);
    const discount = number(raw.savings ?? raw.discount, normalPrice > 0 ? ((normalPrice - salePrice) / normalPrice) * 100 : 0);
    const releaseDate = toReleaseDate(metadata.released) || toReleaseDate(raw.releaseDate);
    const releaseYear = releaseDate ? new Date(releaseDate).getUTCFullYear() : null;
    const steamAppID = cleanText(raw.steamAppID || raw.appid || metadata.id || '');
    const canonicalTitle = normalizeTitle(title);
    const featureText = `${genres.join(' ')} ${tags.join(' ')}`.toLowerCase();
    const key = steamAppID ? `steam:${steamAppID}` : `title:${canonicalTitle}`;

    // "Collection" in a title is not evidence of a multi-pack. Remasters and
    // legacy compilations ship as a single app with ordinary reviews and an
    // ordinary price, while true bundles are store packages whose app lookup
    // returns nothing: no genres, review counts summed across their contents,
    // and a list price that is several MSRPs added together.
    //
    // So the keyword guess only stands when nothing proved otherwise. A
    // resolved genre list means one app answered for this listing, which
    // vetoes it. This can only reclaim titles, never flag new ones.
    const bundleTitle = /\b(bundle|collection|franchise pack)\b/i.test(title) ||
      /\bedition\b.*\band\b.*\bedition\b/i.test(title);
    const resolvedSingleApp = genres.length > 0;

    return {
      key,
      slug: `${slugify(title)}-${steamAppID || slugify(raw.dealID || canonicalTitle).slice(-10)}`,
      title,
      canonicalTitle,
      salePrice,
      normalPrice,
      discount: Math.max(0, Math.min(100, Math.round(discount))),
      storeID: cleanText(raw.storeID),
      storeName: stores[raw.storeID]?.name || cleanText(raw.storeName || 'Store'),
      storeIcon: stores[raw.storeID]?.icon || '',
      dealID: cleanText(raw.dealID),
      steamAppID,
      image: metadata.backgroundImage || raw.thumb || '',
      userRating: number(raw.steamRatingPercent ?? raw.userRating ?? raw.rating, 0),
      reviewCount: number(raw.steamRatingCount ?? raw.reviewCount ?? metadata.ratingsCount, 0),
      reviewText: cleanText(raw.steamRatingText || raw.reviewText),
      criticScore: number(raw.metacriticScore ?? raw.metacritic ?? metadata.metacritic, 0),
      dealRating: number(raw.dealRating, 0),
      historicalLow: number(raw.historicalLow ?? raw.cheapestPrice, 0) || null,
      genres,
      tags,
      platforms,
      releaseDate,
      releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
      publisher: cleanText(metadata.publisher || raw.publisher),
      developer: cleanText(metadata.developer || raw.developer),
      isIndie: featureText.includes('indie'),
      isMultiplayer: /\b(multiplayer|co-op|coop|online co-op|local co-op|pvp)\b/.test(featureText),
      isEarlyAccess: /\bearly access\b/.test(`${title} ${featureText}`.toLowerCase()),
      isBundle: bundleTitle && !resolvedSingleApp,
      contentTypes: flags.types,
      excludedContent: flags.excluded,
      spamLikeTitle: flags.spamLike,
      source: metadata.source || 'cheapshark',
      raw
    };
  }

  return { normalizeDeal, normalizeTitle, slugify, contentFlags };
});
