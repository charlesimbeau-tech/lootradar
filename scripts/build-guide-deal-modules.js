'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const {
  analyzeDiscountCohorts,
  selectDeepDiscountExamples
} = require('../lib/discount-analysis.js');
const { gamePageRoute, selectGamePageDeals } = require('../lib/game-pages.js');
const config = require('../config/editorial-config.js');

const root = path.resolve(__dirname, '..');
const START = '<!-- LIVE_GUIDE_MODULE_START -->';
const END = '<!-- LIVE_GUIDE_MODULE_END -->';
const ARTICLE_PUBLISHED = '2026-07-29';

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Snapshot updatedAt must be a valid date.');
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function formatMetric(value, suffix = '') {
  return value === null ? 'Not enough data' : `${Number(value).toLocaleString('en-US')}${suffix}`;
}

function renderDealCard(deal) {
  const route = gamePageRoute(deal);
  return `<article class="guide-live-card">
    <div class="guide-live-card-top"><span>${escapeHTML(deal.storeName)}</span><strong>${Math.round(Number(deal.discount))}% off</strong></div>
    <h3><a href="../games/${escapeHTML(route)}">${escapeHTML(deal.title)}</a></h3>
    <p class="guide-live-price"><strong>$${Number(deal.salePrice).toFixed(2)}</strong> <span>was $${Number(deal.normalPrice).toFixed(2)}</span></p>
    <p>${Math.round(Number(deal.userRating))}% positive from ${formatNumber(deal.reviewCount)} reviews</p>
    <a class="guide-live-card-link" href="../games/${escapeHTML(route)}">Check this price <span aria-hidden="true">&rarr;</span></a>
  </article>`;
}

function renderDealGrid(deals) {
  return `<div class="guide-live-grid">${deals.map(renderDealCard).join('')}</div>`;
}

function quietState(message, href, label) {
  return `<div class="guide-live-empty"><p>${escapeHTML(message)}</p><a href="${escapeHTML(href)}">${escapeHTML(label)} <span aria-hidden="true">&rarr;</span></a></div>`;
}

function moduleShell(kicker, title, checked, body, note) {
  return `<section class="guide-live-module" aria-labelledby="${escapeHTML(kicker)}-live-title">
    <div class="guide-live-heading">
      <div><span class="guide-live-kicker">Current snapshot</span><h2 id="${escapeHTML(kicker)}-live-title">${escapeHTML(title)}</h2></div>
      <p>Prices checked ${escapeHTML(checked)}</p>
    </div>
    ${body}
    <p class="guide-method-note">${escapeHTML(note)}</p>
  </section>`;
}

function createGuideModules({ snapshot, deals, permanentDeals }) {
  const checked = formatDate(snapshot.updatedAt);
  const permanentRoutes = new Set(permanentDeals.map(gamePageRoute));
  const permanent = deals.filter(deal => permanentRoutes.has(gamePageRoute(deal)));
  const quality = permanent
    .filter(deal => deal.eligible && Number(deal.userRating) >= 80 && Number(deal.reviewCount) >= 1000)
    .sort((a, b) => Number(b.dealScore) - Number(a.dealScore));
  const comparisonDeals = quality.slice(0, 3);
  const steamDeals = quality
    .filter(deal => deal.storeName === 'Steam' && Number(deal.salePrice) < 10)
    .slice(0, 3);
  const freeDeals = quality
    .filter(deal => Number(deal.salePrice) === 0)
    .slice(0, 3);

  return {
    comparison: moduleShell(
      'comparison',
      'Current listings worth comparing',
      checked,
      comparisonDeals.length
        ? renderDealGrid(comparisonDeals)
        : quietState('No listings currently meet the evidence threshold for this module.', '../deals/index.html', 'Browse all live deal lists'),
      'These are examples from participating stores, not a complete market comparison. Confirm the edition and final price with the retailer.'
    ),
    steam: moduleShell(
      'steam',
      'Steam listings under $10 with review support',
      checked,
      steamDeals.length
        ? renderDealGrid(steamDeals)
        : quietState('No quality-qualified Steam listing under $10 is available in this snapshot.', '../deals/steam-deals-under-10.html', 'Check the full under-$10 list'),
      'Listings qualify here only when the game has at least 80% positive feedback and 1,000 player reviews. Prices can change.'
    ),
    free: moduleShell(
      'free',
      'Zero-price offers in the current snapshot',
      checked,
      freeDeals.length
        ? renderDealGrid(freeDeals)
        : quietState('No quality-qualified zero-price listing is available in this snapshot.', '../deals/index.html', 'Browse current deal lists'),
      'A zero price can describe a temporary promotion or a free-to-play product. Read the retailer terms before claiming or installing.'
    )
  };
}

function replaceLiveModule(source, moduleHTML) {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start < 0 || end < start) throw new Error('Guide is missing its live module marker block.');
  return `${source.slice(0, start)}${START}${moduleHTML}${END}${source.slice(end + END.length)}`;
}

function evidenceSentence(analysis) {
  const deep = analysis.deepDiscount;
  if (!deep.count) {
    return 'The current snapshot did not contain a qualifying 90%-off listing, so there is no useful deep-discount cohort to judge today.';
  }
  return `${deep.qualityBackedCount} of ${deep.count} qualifying listings at 90% off or more had at least 80% positive feedback and 1,000 player reviews.`;
}

function renderDiscountArticle({ snapshot, deals, permanentDeals }) {
  const checked = formatDate(snapshot.updatedAt);
  const isoDate = new Date(snapshot.updatedAt).toISOString().slice(0, 10);
  const analysis = analyzeDiscountCohorts(deals);
  const permanentRoutes = new Set(permanentDeals.map(gamePageRoute));
  const examples = selectDeepDiscountExamples(
    deals.filter(deal => permanentRoutes.has(gamePageRoute(deal))),
    3
  );
  const examplesHTML = examples.length
    ? renderDealGrid(examples)
    : quietState('No deep-discount example currently has a permanent LootRadar price page.', '../deals/deep-discounts.html', 'Browse the deep-discount list');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Do 90% discounts mean good PC game deals? | LootRadar</title>
  <meta name="description" content="LootRadar analyzes current PC game listings to see how often a 90% discount is backed by strong player reviews and a worthwhile Deal Score.">
  <link rel="canonical" href="https://thelootradar.com/blog/are-90-percent-discounts-good.html">
  <link rel="alternate" type="application/rss+xml" title="LootRadar deals worth attention" href="/feed.xml">
  <meta property="og:title" content="Does a 90% discount actually mean a good PC game deal?">
  <meta property="og:description" content="A current-snapshot test of the biggest discount badges using player feedback, review volume, and LootRadar Deal Scores.">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://thelootradar.com/blog/are-90-percent-discounts-good.html">
  <meta property="og:site_name" content="LootRadar">
  <meta property="og:image" content="https://thelootradar.com/public/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Does 90% off mean a good PC game deal?">
  <meta name="twitter:description" content="We checked the current evidence behind PC gaming's loudest discount badge.">
  <meta name="twitter:image" content="https://thelootradar.com/public/og.png">
  <script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Does a 90% discount actually mean a good PC game deal?',
    description: 'An analysis of current PC game listings at 90% off or more using player feedback, review volume, and LootRadar Deal Scores.',
    author: { '@type': 'Organization', name: 'LootRadar' },
    publisher: { '@type': 'Organization', name: 'LootRadar', url: 'https://thelootradar.com' },
    datePublished: ARTICLE_PUBLISHED,
    dateModified: isoDate,
    mainEntityOfPage: 'https://thelootradar.com/blog/are-90-percent-discounts-good.html'
  })}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css?v=23">
  <link rel="stylesheet" href="../guides.css?v=2">
  <link rel="icon" href="../icons/icon.svg?v=2" type="image/svg+xml">
  <link rel="icon" href="../icons/favicon-32.png?v=2" sizes="32x32" type="image/png">
  <link rel="icon" href="../icons/favicon.ico?v=2" sizes="any">
  <link rel="apple-touch-icon" href="../icons/apple-touch-icon.png?v=2">
  <link rel="manifest" href="../manifest.json">
  <meta name="theme-color" content="#0b0e0d">
  <meta name="google-adsense-account" content="ca-pub-3845680227675655">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3845680227675655" crossorigin="anonymous"></script>
</head>
<body class="guide-page">
  <a class="skip-link" href="#guide-content">Skip to guide</a>
  <nav class="site-nav" aria-label="Primary navigation">
    <div class="site-nav-inner">
      <a class="nav-brand" href="../index.html" aria-label="LootRadar home"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="primaryNavLinks" aria-label="Toggle navigation menu"><i aria-hidden="true"></i></button>
      <div class="nav-links" id="primaryNavLinks"><a href="../index.html">Deals</a><a href="../methodology.html">How scoring works</a><a href="../recommendations.html">For you</a><a class="active" href="../blog.html">Guides</a><a data-account-link href="../login.html">Sign in</a></div>
    </div>
  </nav>
  <div class="ad-zone ad-zone-top"><span class="ad-label">Advertisement</span><div class="ad-zone-inner"></div></div>
  <article class="blog-content">
    <h1>Does a 90% discount actually mean a good PC game deal?</h1>
    <p class="meta">Prices checked ${escapeHTML(checked)} &middot; LootRadar analysis</p>
    <p>A 90% discount gets attention. It also answers only one question: how far the current price sits below the listed full price. It does not tell you whether players like the game, whether enough people have reviewed it, or whether the sale price buys something worth playing.</p>
    <p>We tested the biggest discount badge against the current LootRadar snapshot. The result is more useful than either praising every steep cut or dismissing all of them.</p>
    <section class="guide-data-hero" aria-labelledby="snapshot-result">
      <span class="guide-live-kicker">Snapshot result</span>
      <h2 id="snapshot-result">${escapeHTML(evidenceSentence(analysis))}</h2>
      <div class="guide-data-grid">
        <div><strong>${formatNumber(analysis.deepDiscount.count)}</strong><span>listings at 90% off or more</span></div>
        <div><strong>${formatMetric(analysis.deepDiscount.qualityBackedShare, '%')}</strong><span>met the review-evidence bar</span></div>
        <div><strong>${formatMetric(analysis.deepDiscount.medianRating, '%')}</strong><span>median player rating</span></div>
        <div><strong>${formatMetric(analysis.deepDiscount.medianDealScore)}</strong><span>median Deal Score</span></div>
      </div>
    </section>
    <h2>What we counted</h2>
    <p>The analysis began with ${formatNumber(analysis.analyzedCount)} qualifying game listings in the published snapshot. We excluded add-ons, bundles, early-access titles, filtered content, and rows without usable price or review data. A listing met the review-evidence bar when it had at least 80% positive player feedback and 1,000 reviews.</p>
    <p>This is a snapshot analysis, not a study of every PC game sale. Participating-store coverage and available metadata shape the sample, and prices can change after the snapshot is built.</p>
    <h2>How the next discount band compared</h2>
    <div class="guide-data-comparison">
      <div><span>90% off or more</span><strong>${formatMetric(analysis.deepDiscount.qualityBackedShare, '%')}</strong><p>met the review-evidence bar across ${formatNumber(analysis.deepDiscount.count)} listings.</p></div>
      <div><span>50% to 89% off</span><strong>${formatMetric(analysis.comparison.qualityBackedShare, '%')}</strong><p>met the same bar across ${formatNumber(analysis.comparison.count)} listings.</p></div>
    </div>
    <p>The discount size can help a worthwhile game become a stronger value. It cannot supply quality or confidence that the underlying game does not have. That is why LootRadar gives player response and review volume separate weight in the <a href="../methodology.html">Deal Score</a>.</p>
    <div class="ad-zone ad-zone-mid"><span class="ad-label">Advertisement</span><div class="ad-zone-inner"></div></div>
    <h2>Deep discounts with stronger current evidence</h2>
    ${examplesHTML}
    <p class="guide-method-note">Examples are drawn from the same snapshot and link to permanent LootRadar price checks. Confirm the edition, activation terms, and final price with the retailer.</p>
    <h2>A better way to judge the badge</h2>
    <ol>
      <li>Ask whether you wanted the game before seeing the percentage.</li>
      <li>Check recent player feedback and the number of reviews behind it.</li>
      <li>Compare the sale price with the amount of game you expect to play.</li>
      <li>Confirm the edition, region, launcher, and final checkout amount.</li>
      <li>Let a strong discount improve the case, not create the case.</li>
    </ol>
    <div class="cta-box"><p>Start with the evidence, then decide whether the price earns your attention.</p><a href="../deals/deep-discounts.html">Browse current deep discounts &rarr;</a></div>
    <p>Related: <a href="game-price-comparison.html">How to compare PC game prices</a> | <a href="steam-sale-guide.html">How to shop a Steam sale</a></p>
  </article>
  <div class="ad-zone ad-zone-bottom"><span class="ad-label">Advertisement</span><div class="ad-zone-inner"></div></div>
  <footer><div class="footer-inner"><div><a class="nav-brand" href="../index.html"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a><p>Games worth playing. Prices worth paying.</p></div><div class="footer-links"><a href="../methodology.html">Scoring</a><a href="../recommendations.html">For you</a><a href="../blog.html">Guides</a><a data-account-link href="../login.html">Sign in</a><a href="../feed.xml">Deal feed</a><a href="../about.html">About</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></div><p class="footer-disclosure">Some retailer links may earn LootRadar a commission. Price listings come from CheapShark and may change after you leave LootRadar. Affiliate relationships never affect Deal Scores.</p></footer>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../supabase-config.js"></script>
  <script src="../lib/site-nav.js?v=1"></script>
  <script src="../lib/guide-page.js?v=1"></script>
  <script src="../lib/auth-nav.js?v=1"></script>
  <script data-goatcounter="https://thelootradar.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

function buildGuideDealModules(options = {}) {
  const baseDir = path.resolve(options.baseDir || root);
  const snapshot = options.snapshot || readJSON(path.join(baseDir, 'deals.json'));
  const deals = options.deals || buildDealDataset(
    snapshot,
    options.enriched || readJSON(path.join(baseDir, 'enriched-deals.json')),
    options.config || config
  );
  const permanentDeals = options.permanentDeals || selectGamePageDeals(deals);
  const modules = createGuideModules({ snapshot, deals, permanentDeals });
  const guideModules = new Map([
    ['blog/game-price-comparison.html', modules.comparison],
    ['blog/best-free-pc-games.html', modules.free],
    ['blog/steam-sale-guide.html', modules.steam]
  ]);
  for (const [relative, moduleHTML] of guideModules) {
    const file = path.join(baseDir, relative);
    const source = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, replaceLiveModule(source, moduleHTML));
  }
  const article = renderDiscountArticle({ snapshot, deals, permanentDeals });
  const articleFile = path.join(baseDir, 'blog', 'are-90-percent-discounts-good.html');
  fs.writeFileSync(articleFile, article);
  return { articleFile, modules, analysis: analyzeDiscountCohorts(deals) };
}

if (require.main === module) {
  const result = buildGuideDealModules();
  console.log(`Refreshed 3 guide modules and ${path.relative(root, result.articleFile)} from ${result.analysis.analyzedCount} qualifying listings.`);
}

module.exports = {
  END,
  START,
  buildGuideDealModules,
  createGuideModules,
  formatDate,
  renderDiscountArticle,
  replaceLiveModule
};
