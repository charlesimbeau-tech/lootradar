'use strict';

// The homepage renders its grid from deals.json in the browser. Anything that
// does not run JavaScript — crawlers, preview bots, readers with scripting off —
// used to get an empty shell, which is exactly what the permanent /deals pages
// were built to avoid. This bakes the current default view into index.html so
// the first paint is real content, then app.js replaces it once data lands.

const fs = require('node:fs');
const path = require('node:path');

const { buildDealDataset } = require('../lib/deal-dataset.js');
const { DEFAULT_FILTERS, filterDeals, sortDeals } = require('../lib/deal-filters.js');
const { gamePageRoute, selectGamePageDeals } = require('../lib/game-pages.js');
const config = require('../config/editorial-config.js');

const root = path.resolve(__dirname, '..');

// Matches PAGE_SIZE in app.js: the static grid should hold exactly what the
// hydrated first render holds, so nothing visibly reshuffles on load.
const CARD_LIMIT = 24;

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeDealID(value) {
  const dealID = String(value || '');
  return /^[A-Za-z0-9%._~-]+$/.test(dealID) ? dealID : '';
}

function safeImage(value) {
  const url = String(value || '');
  return /^https?:\/\//i.test(url) ? escapeHTML(url) : '';
}

function money(value) {
  const number = Number(value || 0);
  return number === 0
    ? 'Free'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number);
}

function compact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function scoreTone(score) {
  if (score >= 80) return 'elite';
  if (score >= 65) return 'strong';
  if (score >= 50) return 'fair';
  return 'weak';
}

function scoreLabel(score) {
  if (score >= 85) return 'Excellent value';
  if (score >= 75) return 'Great deal';
  if (score >= 65) return 'Strong value';
  if (score >= 55) return 'Worth a look';
  return 'Low confidence';
}

function reviewMarkup(deal) {
  if (!deal.userRating) return '<span class="muted">Limited review data</span>';
  return `<span class="review-score">${deal.userRating}% positive</span><span>${compact(deal.reviewCount)} reviews</span>`;
}

// A server-rendered timestamp cannot know the reader's timezone, so it names the
// one it used instead of quietly implying local time.
function snapshotLabel(updatedAt) {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return 'Saved price snapshot';
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(parsed);
  return `Prices checked ${label}`;
}

function cardMarkup(deal, index) {
  const image = safeImage(deal.image);
  const route = deal.gamePageRoute ? `games/${escapeHTML(deal.gamePageRoute)}` : '';
  const priceLabel = deal.historicalLow
    ? (deal.salePrice <= deal.historicalLow * 1.01
        ? 'Historical low'
        : `${money(deal.salePrice - deal.historicalLow)} above low`)
    : `${Math.round(deal.scoreBreakdown?.components?.priceValue || 0)} price-value signal`;
  const media = image
    ? `<img src="${image}" alt="${escapeHTML(deal.title)} cover art" loading="lazy" decoding="async">`
    : '<span class="image-fallback">LR</span>';
  const badges = `<span class="discount-badge">−${escapeHTML(deal.discount)}%</span>${
    deal.isEarlyAccess ? '<span class="content-badge">Early Access</span>' : ''
  }`;

  // Without JavaScript the detail dialog cannot open, so the image and title
  // point at the permanent game page when one exists and stay inert when it
  // does not. Nothing here pretends to be a control that will not respond.
  const imageBlock = route
    ? `<a class="card-image" href="${route}" aria-label="Price details for ${escapeHTML(deal.title)}">${media}${badges}</a>`
    : `<div class="card-image">${media}${badges}</div>`;
  const titleBlock = route
    ? `<a class="card-title" href="${route}">${escapeHTML(deal.title)}</a>`
    : `<span class="card-title">${escapeHTML(deal.title)}</span>`;

  return `<article class="deal-card" data-key="${escapeHTML(deal.key)}" style="--delay:${Math.min(index, 12) * 28}ms">
      ${imageBlock}
      <div class="card-content">
        <div class="card-overline"><span>${escapeHTML(deal.storeName)}</span><span>${escapeHTML(deal.genres?.[0] || 'PC game')}</span></div>
        ${titleBlock}
        <div class="card-reviews">${reviewMarkup(deal)}</div>
        <div class="card-price-row">
          <div><span class="old-price">${money(deal.normalPrice)}</span><strong>${money(deal.salePrice)}</strong></div>
          <span class="history-note">${escapeHTML(priceLabel)}</span>
        </div>
        <div class="score-row">
          <div class="score-ring ${scoreTone(deal.dealScore)}" style="--score:${escapeHTML(deal.dealScore)}" aria-label="Deal Score ${escapeHTML(deal.dealScore)} out of 100">
            <strong>${escapeHTML(deal.dealScore)}</strong><span>score</span>
          </div>
          <div><strong>${scoreLabel(deal.dealScore)}</strong><p>${escapeHTML(deal.recommendation)}</p></div>
        </div>
        <div class="card-actions">
          <a class="button button-card" href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(deal.dealID))}" target="_blank" rel="noopener noreferrer sponsored" data-track-deal="homepage_card" data-store="${escapeHTML(deal.storeName)}" data-price="${escapeHTML(deal.salePrice)}">View at ${escapeHTML(deal.storeName)}</a>
        </div>
      </div>
    </article>`;
}

function heroMarkup(deal) {
  if (!deal) return '';
  const image = safeImage(deal.image);
  const route = deal.gamePageRoute ? `games/${escapeHTML(deal.gamePageRoute)}` : '';
  const title = route
    ? `<h2><a href="${route}">${escapeHTML(deal.title)}</a></h2>`
    : `<h2>${escapeHTML(deal.title)}</h2>`;
  return `<div class="pick-image">${
    image ? `<img src="${image}" alt="${escapeHTML(deal.title)} cover art" loading="eager" decoding="async">` : ''
  }<span>Pick of the day</span></div>
      <div class="pick-content">
        <div class="pick-head"><div><p>${escapeHTML(deal.storeName)}</p>${title}</div>
          <div class="score-ring ${scoreTone(deal.dealScore)}" style="--score:${escapeHTML(deal.dealScore)}"><strong>${escapeHTML(deal.dealScore)}</strong><span>score</span></div>
        </div>
        <p>${escapeHTML(deal.recommendation)}</p>
        <div class="pick-price"><span class="old-price">${money(deal.normalPrice)}</span><strong>${money(deal.salePrice)}</strong><span class="pick-discount">−${escapeHTML(deal.discount)}%</span></div>
        <a class="button button-primary" href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(deal.dealID))}" target="_blank" rel="noopener noreferrer sponsored" data-track-deal="hero_pick" data-store="${escapeHTML(deal.storeName)}" data-price="${escapeHTML(deal.salePrice)}">View at ${escapeHTML(deal.storeName)}</a>
      </div>`;
}

function replaceRegion(html, name, content) {
  const start = `<!--LR:${name}:start-->`;
  const end = `<!--LR:${name}:end-->`;
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end);
  if (startAt === -1 || endAt === -1 || endAt < startAt) {
    throw new Error(`index.html is missing the ${name} fallback markers`);
  }
  return html.slice(0, startAt + start.length) + content + html.slice(endAt);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildHomeFallback(options = {}) {
  const base = options.base || readJSON(path.join(root, 'deals.json'));
  const enriched = options.enriched
    || (options.enriched === null ? null : readJSON(path.join(root, 'enriched-deals.json')));
  const deals = options.deals || buildDealDataset(base, enriched, options.config || config);

  const routes = new Map(selectGamePageDeals(deals).map(deal => [deal.key, gamePageRoute(deal)]));
  const withRoutes = deals.map(deal => ({ ...deal, gamePageRoute: routes.get(deal.key) || '' }));

  // The same filter and sort the browser applies on first paint, so the static
  // grid and the hydrated grid agree instead of visibly reshuffling.
  const visible = sortDeals(filterDeals(withRoutes, DEFAULT_FILTERS), DEFAULT_FILTERS.sort);
  // Mirrors renderHero in app.js: the same default content rules as the grid.
  const hero = sortDeals(filterDeals(withRoutes, DEFAULT_FILTERS), 'recommended')[0];
  // This is always the default view, so the pick is always held back from the
  // grid, exactly as render() does before the reader touches anything.
  const shown = visible.filter(deal => !hero || deal.key !== hero.key).slice(0, CARD_LIMIT);

  const stores = base.stores || enriched?.stores || {};
  const qualified = withRoutes.filter(deal => deal.eligible).length;

  const source = options.indexPath || path.join(root, 'index.html');
  let html = fs.readFileSync(source, 'utf8');
  html = replaceRegion(html, 'deals', shown.map(cardMarkup).join('\n      '));
  html = replaceRegion(html, 'hero', heroMarkup(hero));
  html = replaceRegion(html, 'updated', escapeHTML(snapshotLabel(base.updatedAt)));
  html = replaceRegion(html, 'qualified', escapeHTML(compact(qualified)));
  html = replaceRegion(html, 'stores', escapeHTML(String(Object.keys(stores).length)));
  html = replaceRegion(
    html,
    'count',
    escapeHTML(`${visible.length} ${visible.length === 1 ? 'deal' : 'deals'}`)
  );
  fs.writeFileSync(options.outputPath || source, html);

  return { cards: shown.length, qualified, visible: visible.length, stores: Object.keys(stores).length };
}

if (require.main === module) {
  const result = buildHomeFallback();
  console.log(
    `Baked ${result.cards} homepage cards into index.html (${result.visible} in the default view, ${result.qualified} qualified, ${result.stores} stores).`
  );
}

module.exports = { CARD_LIMIT, buildHomeFallback, cardMarkup, replaceRegion, snapshotLabel };
