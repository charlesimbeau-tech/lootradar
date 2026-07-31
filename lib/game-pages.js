'use strict';

const { slugify } = require('./deal-normalizer.js');

// One page per qualifying game is the point: "hollow knight price" is winnable
// for a new site in a way that "pc game deals" is not. The cap exists only to
// bound a runaway snapshot, not to ration pages.
const GAME_PAGE_LIMIT = Number(process.env.GAME_PAGE_LIMIT || 600);
// How many the hub lists before deferring to search; every page stays in the
// sitemap and is reachable from the collections and related links.
const GAME_HUB_LIMIT = Number(process.env.GAME_HUB_LIMIT || 60);
const MIN_GAME_PAGE_SCORE = 70;
const MIN_GAME_PAGE_RATING = 80;
const MIN_GAME_PAGE_REVIEWS = 1000;

function gamePageRoute(deal) {
  const steamAppID = String(deal?.steamAppID || '').trim();
  const title = String(deal?.title || '').trim();
  const slug = title ? slugify(title) : '';
  if (!steamAppID || !slug) return '';
  return `${slug}-${steamAppID}.html`;
}

function selectGamePageDeals(deals, limit = GAME_PAGE_LIMIT) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  return (Array.isArray(deals) ? deals : [])
    .filter(deal => (
      deal?.eligible &&
      !deal.excludedContent &&
      !deal.isBundle &&
      !deal.isEarlyAccess &&
      gamePageRoute(deal) &&
      Array.isArray(deal.genres) && deal.genres.length > 0 &&
      Number(deal.dealScore) >= MIN_GAME_PAGE_SCORE &&
      Number(deal.userRating) >= MIN_GAME_PAGE_RATING &&
      Number(deal.reviewCount) >= MIN_GAME_PAGE_REVIEWS
    ))
    .sort((a, b) => (
      Number(b.dealScore) - Number(a.dealScore) ||
      Number(b.reviewCount) - Number(a.reviewCount) ||
      String(a.title).localeCompare(String(b.title))
    ))
    .slice(0, safeLimit);
}

module.exports = {
  GAME_HUB_LIMIT,
  GAME_PAGE_LIMIT,
  MIN_GAME_PAGE_RATING,
  MIN_GAME_PAGE_REVIEWS,
  MIN_GAME_PAGE_SCORE,
  gamePageRoute,
  selectGamePageDeals
};
