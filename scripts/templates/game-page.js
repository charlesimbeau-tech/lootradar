'use strict';

const { gamePageRoute } = require('../../lib/game-pages.js');
const SITE_ORIGIN = 'https://thelootradar.com';

function escapeHTML(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeJSON(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function safeDealID(value) {
  const id = String(value || '');
  return /^[A-Za-z0-9%._~-]+$/.test(id) ? id : '';
}
function formatPrice(value) {
  if (Number(value || 0) === 0) return 'Free';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
}
function formatCount(value) { return new Intl.NumberFormat('en-US').format(Number(value || 0)); }
function formatSnapshot(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { iso: '', label: 'the latest saved snapshot' };
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(date)
  };
}
function genreText(deal) {
  const genres = Array.isArray(deal.genres) ? deal.genres.filter(Boolean).slice(0, 4) : [];
  return genres.length ? genres.join(', ') : 'PC game';
}
function selectionReason(deal) {
  return `A Deal Score of ${deal.dealScore}, backed by ${deal.userRating}% positive player feedback across ${formatCount(deal.reviewCount)} reviews. That is a lot of people agreeing.`;
}
function schemaForGame(deal, canonical) {
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Product', '@id': `${canonical}#game`, name: deal.title,
      description: `${deal.title} PC price check from LootRadar, based on a current quality-qualified offer.`,
      image: /^https?:\/\//i.test(String(deal.image || '')) ? deal.image : `${SITE_ORIGIN}/public/og.png`,
      category: genreText(deal), sku: `steam-${deal.steamAppID}`,
      aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(deal.userRating), bestRating: 100, worstRating: 0, reviewCount: Number(deal.reviewCount) },
      offers: { '@type': 'Offer', url: `https://www.cheapshark.com/redirect?dealID=${safeDealID(deal.dealID)}`, priceCurrency: 'USD', price: Number(deal.salePrice).toFixed(2), availability: 'https://schema.org/InStock', seller: { '@type': 'Organization', name: deal.storeName } } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LootRadar', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Game price checks', item: `${SITE_ORIGIN}/games/index.html` },
      { '@type': 'ListItem', position: 3, name: deal.title, item: canonical }
    ] }
  ] };
}
function pageHead(title, description, canonical, image, schema) {
  const socialImage = image || `${SITE_ORIGIN}/public/og.png`;
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title><meta name="description" content="${escapeHTML(description)}">
  <link rel="canonical" href="${escapeHTML(canonical)}"><link rel="alternate" type="application/rss+xml" title="LootRadar deals worth attention" href="/feed.xml">
  <meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHTML(canonical)}"><meta property="og:site_name" content="LootRadar"><meta property="og:image" content="${escapeHTML(socialImage)}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}"><meta name="twitter:image" content="${escapeHTML(socialImage)}">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css?v=26"><link rel="stylesheet" href="../game-pages.css?v=1">
  <link rel="icon" href="../icons/icon.svg?v=2" type="image/svg+xml"><link rel="icon" href="../icons/favicon-32.png?v=2" sizes="32x32" type="image/png"><link rel="icon" href="../icons/favicon.ico?v=2" sizes="any"><link rel="apple-touch-icon" href="../icons/apple-touch-icon.png?v=2"><link rel="manifest" href="../manifest.json"><meta name="theme-color" content="#0b0e0d">
  <meta name="google-adsense-account" content="ca-pub-3845680227675655"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3845680227675655" crossorigin="anonymous"></script><script type="application/ld+json">${safeJSON(schema)}</script>`;
}
function header() {
  return `<a class="skip-link" href="#mainContent">Skip to price check</a><nav class="site-nav" aria-label="Primary navigation"><div class="site-nav-inner"><a class="nav-brand" href="../index.html" aria-label="LootRadar home"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a><button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="primaryNavLinks" aria-label="Toggle navigation menu"><i aria-hidden="true"></i></button><div class="nav-links" id="primaryNavLinks"><a href="../deals/index.html">Deals</a><a class="active" href="index.html">Game price checks</a><a href="../methodology.html">How scoring works</a><a href="../blog.html">Guides</a><a data-account-link href="../login.html">Sign in</a></div></div></nav>`;
}
function footer() {
  return `<footer><div class="footer-inner"><div><a class="nav-brand" href="../index.html"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a><p>Games worth playing. Prices worth paying.</p></div><div class="footer-links"><a href="../methodology.html">Scoring</a><a href="index.html">Game price checks</a><a href="../deals/index.html">Deals</a><a href="../blog.html">Guides</a><a href="../about.html">About</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></div><p class="footer-disclosure">LootRadar is funded by advertising. Deal links and prices both come via CheapShark, which may earn a commission from the retailer, and prices can change once you leave. Neither has ever moved a Deal Score.</p></footer>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="../supabase-config.js"></script><script src="../lib/site-nav.js?v=1"></script><script src="../lib/auth-nav.js?v=1"></script><script src="../lib/analytics.js?v=2"></script><script>document.addEventListener('click',function(event){var link=event.target.closest('[data-track-deal]');if(!link||!window.LootRadarAnalytics)return;window.LootRadarAnalytics.track('deal_click',{surface:link.dataset.trackSurface,store:link.dataset.trackStore,priceBucket:window.LootRadarAnalytics.priceBucket(link.dataset.trackPrice)});});</script><script data-goatcounter="https://thelootradar.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>`;
}
function renderGamePage(deal, snapshotInput = {}) {
  const route = gamePageRoute(deal);
  if (!route) throw new TypeError('A title and Steam app ID are required.');
  const canonical = `${SITE_ORIGIN}/games/${route}`;
  const snapshot = formatSnapshot(snapshotInput.updatedAt);
  const title = `${deal.title} PC deal and price check | LootRadar`;
  const description = `${deal.title} is ${formatPrice(deal.salePrice)} at ${deal.storeName} in the latest LootRadar sweep. Here is the Deal Score, the player rating, and what to check before you buy.`;
  const image = /^https?:\/\//i.test(String(deal.image || '')) ? deal.image : `${SITE_ORIGIN}/public/og.png`;
  const art = /^https?:\/\//i.test(String(deal.image || '')) ? `<img src="${escapeHTML(deal.image)}" alt="${escapeHTML(deal.title)} artwork" width="920" height="430" decoding="async">` : '<div class="game-art-fallback" aria-hidden="true">LR</div>';
  const tags = [genreText(deal), deal.releaseYear ? String(deal.releaseYear) : '', 'PC'].filter(Boolean);
  return `<!doctype html><html lang="en"><head>${pageHead(title, description, canonical, image, schemaForGame(deal, canonical))}</head><body>${header()}<main class="game-shell" id="mainContent">
  <nav class="game-breadcrumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span><a href="index.html">Game price checks</a><span>/</span><span aria-current="page">${escapeHTML(deal.title)}</span></nav>
  <header class="game-hero"><div class="game-art">${art}</div><div class="game-hero-copy"><p class="section-kicker">This one cleared the quality bar</p><h1>${escapeHTML(deal.title)} PC deal and price check</h1><p class="game-lede">Today&rsquo;s price, the review evidence behind it, and the reason it ranked where it did.</p><div class="game-tags">${tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div></div></header>
  <section class="offer-panel" aria-labelledby="currentOffer"><div><p class="offer-label">The offer we saved</p><h2 id="currentOffer">${formatPrice(deal.salePrice)} at ${escapeHTML(deal.storeName)}</h2><p>That is ${escapeHTML(deal.discount)}% off the listed normal price of ${formatPrice(deal.normalPrice)}.</p><time${snapshot.iso ? ` datetime="${snapshot.iso}"` : ''}>Prices checked ${escapeHTML(snapshot.label)}</time></div><a class="offer-button" href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(deal.dealID))}" target="_blank" rel="sponsored noopener noreferrer" data-track-deal data-track-surface="game_price_page" data-track-store="${escapeHTML(deal.storeName)}" data-track-price="${escapeHTML(deal.salePrice)}">Check price at ${escapeHTML(deal.storeName)}</a></section>
  <section class="evidence-grid" aria-label="Deal evidence"><article><span>Deal Score</span><strong>${escapeHTML(deal.dealScore)}<small>/100</small></strong><p>Our combined ranking signal. Emphatically not a review score.</p></article><article><span>Player rating</span><strong>${escapeHTML(deal.userRating)}<small>% positive</small></strong><p>Out of ${formatCount(deal.reviewCount)} recorded player reviews.</p></article><article><span>Price cut</span><strong>${escapeHTML(deal.discount)}<small>% off</small></strong><p>Normally ${formatPrice(deal.normalPrice)}, currently ${formatPrice(deal.salePrice)}.</p></article></section>
  <section class="game-context"><div><p class="section-kicker">Why it made the cut</p><h2>There is real evidence behind this price</h2><p>${escapeHTML(selectionReason(deal))}</p><p>These permanent pages keep out add-ons, bundles, Early Access listings, and anything running on a thin review signal.</p></div><aside><h2>Check these before you buy</h2><ul><li>The final price and the exact edition, on the store page.</li><li>Platform, launcher, region, and activation requirements.</li><li>Whether you will actually play it. The discount cannot answer that one.</li></ul></aside></section>
  <section class="snapshot-note"><h2>About this price check</h2><p>This page shows one saved offer from the latest data refresh. It makes no claim about this being the lowest price the game has ever reached, because we cannot prove that. Store prices and availability both move between refreshes.</p></section>
  <nav class="game-related" aria-label="Related pages"><a href="index.html">Browse more game price checks</a><a href="../deals/index.html">Browse live deal lists</a><a href="../methodology.html">See how Deal Scores work</a><a href="../blog.html">Read buying guides</a></nav></main>${footer()}</body></html>`;
}
function renderGameHub(deals, snapshotInput = {}) {
  const canonical = `${SITE_ORIGIN}/games/index.html`;
  const snapshot = formatSnapshot(snapshotInput.updatedAt);
  const title = 'PC game deals with price and quality checks | LootRadar';
  const description = 'Permanent price-check pages for games that cleared a stricter bar: strong player ratings, thousands of reviews, and a Deal Score of 70 or better.';
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: canonical, description, ...(snapshot.iso ? { dateModified: snapshot.iso } : {}), mainEntity: { '@type': 'ItemList', numberOfItems: deals.length, itemListElement: deals.map((deal, index) => ({ '@type': 'ListItem', position: index + 1, name: deal.title, url: `${SITE_ORIGIN}/games/${gamePageRoute(deal)}` })) } };
  const cards = deals.map(deal => `<article class="game-card"><p>${escapeHTML(deal.storeName)} <span>${escapeHTML(deal.dealScore)} Deal Score</span></p><h2><a href="${escapeHTML(gamePageRoute(deal))}">${escapeHTML(deal.title)}</a></h2><div><strong>${formatPrice(deal.salePrice)}</strong><s>${formatPrice(deal.normalPrice)}</s><span>${escapeHTML(deal.discount)}% off</span></div><p>${escapeHTML(deal.userRating)}% positive from ${formatCount(deal.reviewCount)} reviews</p><a class="card-detail-link" href="${escapeHTML(gamePageRoute(deal))}">See the full breakdown</a></article>`).join('');
  return `<!doctype html><html lang="en"><head>${pageHead(title, description, canonical, `${SITE_ORIGIN}/public/og.png`, schema)}</head><body>${header()}<main class="game-shell" id="mainContent"><nav class="game-breadcrumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span><span aria-current="page">Game price checks</span></nav><header class="game-hub-hero"><p class="section-kicker">Permanent game pages</p><h1>PC game deals with the evidence attached</h1><p>Everything here cleared a deliberately harsh bar: at least 80% positive feedback, at least 1,000 player reviews, and a Deal Score of 70 or better. Not many games manage all three.</p><time${snapshot.iso ? ` datetime="${snapshot.iso}"` : ''}>Prices checked ${escapeHTML(snapshot.label)}</time></header><section class="hub-rule"><strong>${deals.length} current price checks</strong><p>Every page is rebuilt from the saved snapshot and says exactly how far the data goes, and where it stops.</p></section><section class="game-card-grid" aria-label="Game price checks">${cards}</section><nav class="game-related" aria-label="Related pages"><a href="../deals/index.html">Browse deal collections</a><a href="../games.html">Search the full catalog</a><a href="../methodology.html">Read the scoring methodology</a><a href="../feed.xml">Follow the deal feed</a></nav></main>${footer()}</body></html>`;
}
module.exports = { renderGameHub, renderGamePage };
