(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarRssFeed = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_ORIGIN = 'https://thelootradar.com';
  const MAX_ITEMS = 20;

  function escapeXml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function normalizeOrigin(value) {
    let parsed;
    try {
      parsed = new URL(value || DEFAULT_ORIGIN);
    } catch {
      throw new TypeError('RSS origin must be a valid HTTPS URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new TypeError('RSS origin must use HTTPS.');
    }
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  function normalizeSnapshotDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      throw new TypeError('RSS updatedAt must be a valid snapshot timestamp.');
    }
    return date;
  }

  function fixedPrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? price.toFixed(2) : null;
  }

  function scoreLabel(value) {
    if (value === null || value === undefined || value === '') return null;
    const score = Number(value);
    if (!Number.isFinite(score)) return null;
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
  }

  function createSearchUrl(origin, title) {
    const url = new URL('/', `${origin}/`);
    url.searchParams.set('q', title);
    url.searchParams.set('collection', 'all');
    return url.toString();
  }

  function endSentence(value) {
    return /[.!?]["'’”»)\]}]*$/.test(value) ? value : `${value}.`;
  }

  function qualifiedDeals(deals, limit) {
    return (Array.isArray(deals) ? deals : [])
      .filter(deal => {
        return deal
          && deal.eligible === true
          && deal.excludedContent !== true
          && deal.isBundle !== true
          && deal.isEarlyAccess !== true
          && String(deal.key || '').trim()
          && String(deal.title || '').trim()
          && fixedPrice(deal.salePrice) !== null
          && scoreLabel(deal.dealScore) !== null;
      })
      .slice()
      .sort((a, b) => Number(b.dealScore) - Number(a.dealScore)
        || Number(b.reviewCount || 0) - Number(a.reviewCount || 0)
        || String(a.title).localeCompare(String(b.title)))
      .slice(0, limit);
  }

  function renderItem(deal, origin, pubDate, snapshotIso) {
    const title = String(deal.title).trim();
    const key = String(deal.key).trim();
    const price = fixedPrice(deal.salePrice);
    const score = scoreLabel(deal.dealScore);
    const store = String(deal.storeName || 'Participating store').trim();
    const recommendationValue = String(deal.recommendation || '').trim();
    const recommendation = recommendationValue
      || 'This one made it through the quality filters.';
    const link = createSearchUrl(origin, title);
    const displayPrice = Number(price) === 0 ? 'Free' : `$${price}`;
    const description = [
      `${displayPrice} at ${store}.`,
      `LootRadar Deal Score: ${score}/100.`,
      endSentence(recommendation),
      `Price listings may change, so confirm the final price and availability at the store.`,
      `Snapshot checked ${snapshotIso}.`
    ].join(' ');

    return [
      '    <item>',
      `      <title>${escapeXml(`${title} — ${displayPrice} at ${store}`)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(`urn:lootradar:${key}:${price}`)}</guid>`,
      `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
      `      <description>${escapeXml(description)}</description>`,
      '    </item>'
    ].join('\n');
  }

  function createRssFeed(deals, options = {}) {
    const origin = normalizeOrigin(options.origin || DEFAULT_ORIGIN);
    const snapshot = normalizeSnapshotDate(options.updatedAt);
    const snapshotIso = snapshot.toISOString();
    const pubDate = snapshot.toUTCString();
    const requestedLimit = Number(options.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_ITEMS, Math.floor(requestedLimit)))
      : MAX_ITEMS;
    const items = qualifiedDeals(deals, limit)
      .map(deal => renderItem(deal, origin, pubDate, snapshotIso))
      .join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      '    <title>LootRadar — Deals worth your attention</title>',
      `    <link>${escapeXml(`${origin}/`)}</link>`,
      '    <description>The PC game deals that survived the quality filters, straight from the latest LootRadar sweep.</description>',
      '    <language>en-us</language>',
      `    <lastBuildDate>${escapeXml(pubDate)}</lastBuildDate>`,
      `    <pubDate>${escapeXml(pubDate)}</pubDate>`,
      `    <atom:link href="${escapeXml(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
      '    <generator>LootRadar</generator>',
      items,
      '  </channel>',
      '</rss>',
      ''
    ].filter(line => line !== '').join('\n');
  }

  return { createRssFeed, escapeXml };
});
