'use strict';

const SITE_ORIGIN = 'https://thelootradar.com';
const MIN_INDEXABLE_DEALS = 6;

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJSON(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function safeDealID(value) {
  const dealID = String(value || '');
  return /^[A-Za-z0-9%._~-]+$/.test(dealID) ? dealID : '';
}

function formatPrice(value) {
  const price = Number(value || 0);
  if (price === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price);
}

function formatCount(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function formatSnapshot(updatedAt) {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return { iso: '', label: 'the latest saved snapshot' };
  }
  return {
    iso: parsed.toISOString(),
    label: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(parsed)
  };
}

function recommendationFor(deal) {
  if (deal.recommendation) return deal.recommendation;
  if (Number(deal.userRating) > 0 && Number(deal.reviewCount) > 0) {
    return `${deal.userRating}% positive from ${formatCount(deal.reviewCount)} reviews, with a ${deal.discount}% price cut in this snapshot.`;
  }
  return `${deal.discount}% off at ${deal.storeName}; review confidence is limited.`;
}

function renderDealCard(deal) {
  const review = Number(deal.userRating) > 0
    ? `${deal.userRating}% positive from ${formatCount(deal.reviewCount)} reviews`
    : 'Limited player-review data';
  const image = /^https?:\/\//i.test(String(deal.image || ''))
    ? `<img src="${escapeHTML(deal.image)}" alt="" loading="lazy">`
    : '<span class="landing-image-fallback" aria-hidden="true">LR</span>';
  return `<article class="landing-deal-card">
    <div class="landing-deal-image">${image}<span>${escapeHTML(deal.discount)}% off</span></div>
    <div class="landing-deal-body">
      <p class="landing-overline">${escapeHTML(deal.storeName)} · Deal Score ${escapeHTML(deal.dealScore)}</p>
      <h2>${escapeHTML(deal.title)}</h2>
      <p class="landing-review">${escapeHTML(review)}</p>
      <p class="landing-reason">${escapeHTML(recommendationFor(deal))}</p>
      <div class="landing-price"><s>${formatPrice(deal.normalPrice)}</s><strong>${formatPrice(deal.salePrice)}</strong></div>
      <a href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(deal.dealID))}" target="_blank" rel="sponsored noopener noreferrer" data-track-deal data-track-surface="search_landing" data-track-store="${escapeHTML(deal.storeName)}" data-track-price="${escapeHTML(deal.salePrice)}">View at ${escapeHTML(deal.storeName)}</a>
    </div>
  </article>`;
}

function renderCollectionLinks(collections, currentId) {
  return collections.map(item => {
    const current = item.id === currentId ? ' aria-current="page"' : '';
    return `<a href="${escapeHTML(item.route)}"${current}>${escapeHTML(item.shortLabel)}</a>`;
  }).join('');
}

function renderHubCards(collections) {
  return collections.map(item => `<article class="landing-hub-card">
    <p>${escapeHTML(item.kicker)}</p>
    <h2><a href="${escapeHTML(item.route)}">${escapeHTML(item.heading)}</a></h2>
    <p>${escapeHTML(item.cardSummary)}</p>
    <span>${escapeHTML(item.count)} qualifying ${item.count === 1 ? 'deal' : 'deals'} in this snapshot</span>
  </article>`).join('');
}

function buildStructuredData(definition, deals, snapshot) {
  const canonical = `${SITE_ORIGIN}${definition.canonicalPath}`;
  const visibleItems = definition.isHub
    ? definition.collections.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.heading,
        url: `${SITE_ORIGIN}/deals/${item.route}`
      }))
    : deals.map((deal, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Thing',
          name: deal.title,
          description: recommendationFor(deal)
        }
      }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': canonical,
        url: canonical,
        name: definition.heading,
        description: definition.description,
        ...(snapshot.iso ? { dateModified: snapshot.iso } : {}),
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: visibleItems.length,
          itemListElement: visibleItems
        }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'LootRadar',
            item: `${SITE_ORIGIN}/`
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'PC game deals',
            item: `${SITE_ORIGIN}/deals/index.html`
          },
          ...(!definition.isHub ? [{
            '@type': 'ListItem',
            position: 3,
            name: definition.heading,
            item: canonical
          }] : [])
        ]
      }
    ]
  };
}

function renderLandingPage(definition, deals, snapshotInput) {
  const snapshot = formatSnapshot(snapshotInput?.updatedAt);
  const indexable = definition.isHub || deals.length >= MIN_INDEXABLE_DEALS;
  const canonical = `${SITE_ORIGIN}${definition.canonicalPath}`;
  const quietNotice = !indexable
    ? `<aside class="landing-quiet"><strong>A quiet collection</strong><p>This collection is unusually quiet in the current snapshot. Browse today&rsquo;s best deals while the next refresh is on its way.</p><a href="best-pc-game-deals.html">Browse today&rsquo;s best deals</a></aside>`
    : '';
  const mainContent = definition.isHub
    ? `<section class="landing-hub-grid" aria-label="Deal collections">${renderHubCards(definition.collections)}</section>`
    : `<section class="landing-card-grid" aria-label="${escapeHTML(definition.heading)}">${deals.map(renderDealCard).join('')}</section>`;
  const relatedGuide = definition.relatedGuide
    ? `<a href="../${escapeHTML(definition.relatedGuide.path)}">${escapeHTML(definition.relatedGuide.label)}</a>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(definition.title)}</title>
  <meta name="description" content="${escapeHTML(definition.description)}">
${indexable ? '' : '  <meta name="robots" content="noindex,follow">\n'}  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="application/rss+xml" title="LootRadar deals worth attention" href="/feed.xml">
  <meta property="og:title" content="${escapeHTML(definition.title)}">
  <meta property="og:description" content="${escapeHTML(definition.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="LootRadar">
  <meta property="og:image" content="${SITE_ORIGIN}/public/og.png">
  <link rel="stylesheet" href="../style.css?v=21">
  <link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
  <meta name="theme-color" content="#0b0e0d">
  <meta name="google-adsense-account" content="ca-pub-3845680227675655">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3845680227675655" crossorigin="anonymous"></script>
  <script type="application/ld+json">${safeJSON(buildStructuredData(definition, deals, snapshot))}</script>
  <style>
    .landing-shell{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:3rem 0 5rem}
    .landing-breadcrumbs,.landing-collection-nav{display:flex;flex-wrap:wrap;gap:.6rem 1rem;font-size:.76rem;color:var(--text-3)}
    .landing-breadcrumbs a,.landing-collection-nav a{color:var(--text-2);text-decoration:none}
    .landing-collection-nav{margin:1.5rem 0 3rem;padding:1rem 0;border-block:1px solid var(--line)}
    .landing-collection-nav a[aria-current=page]{color:var(--mint)}
    .landing-hero{max-width:920px;padding:4rem 0 2rem}
    .landing-hero h1{margin:.4rem 0 1rem;font:800 clamp(2.8rem,7vw,5.8rem)/.98 var(--display);letter-spacing:-.06em}
    .landing-hero>p{max-width:760px;color:var(--text-2);font-size:1.05rem;line-height:1.7}
    .landing-time{display:block;margin-top:1rem;color:var(--text-3);font-size:.78rem}
    .landing-copy{display:grid;grid-template-columns:1.1fr .9fr;gap:4rem;margin:1rem 0 4rem;padding:2rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
    .landing-copy p{margin:0 0 1rem;color:var(--text-2);line-height:1.75}
    .landing-copy h2{margin:0 0 1rem;color:var(--mint);font:800 1.35rem/1.2 var(--display)}
    .landing-caveat{padding-top:1rem;border-top:1px solid var(--line);font-size:.83rem}
    .landing-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
    .landing-deal-card,.landing-hub-card{overflow:hidden;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
    .landing-deal-image{position:relative;display:grid;place-items:center;height:150px;background:var(--surface-3)}
    .landing-deal-image img{width:100%;height:100%;object-fit:cover}
    .landing-image-fallback{font:800 2rem/1 var(--display);color:var(--mint)}
    .landing-deal-image>span:last-child{position:absolute;right:.7rem;top:.7rem;padding:.35rem .5rem;border-radius:999px;background:var(--mint);color:var(--bg);font-size:.68rem;font-weight:800}
    .landing-deal-body{padding:1.1rem}.landing-deal-body h2{min-height:2.5em;margin:.4rem 0;font:800 1.05rem/1.25 var(--display);color:var(--text)}
    .landing-overline{margin:0;color:var(--mint);font-size:.67rem;text-transform:uppercase;letter-spacing:.06em}
    .landing-review,.landing-reason{color:var(--text-3);font-size:.76rem;line-height:1.55}.landing-reason{min-height:3.1em}
    .landing-price{display:flex;align-items:baseline;gap:.7rem;margin:1rem 0}.landing-price s{color:var(--text-3)}.landing-price strong{font:800 1.25rem/1 var(--display)}
    .landing-deal-body>a{display:inline-flex;padding:.6rem .8rem;border:1px solid var(--line);border-radius:8px;color:var(--text);text-decoration:none;font-size:.75rem;font-weight:800}
    .landing-hub-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.landing-hub-card{padding:1.5rem}
    .landing-hub-card>p:first-child{color:var(--mint);font-size:.7rem;text-transform:uppercase;letter-spacing:.07em}.landing-hub-card h2{font:800 1.35rem/1.2 var(--display)}
    .landing-hub-card h2 a{color:var(--text);text-decoration:none}.landing-hub-card p,.landing-hub-card span{color:var(--text-3);line-height:1.6}.landing-hub-card span{font-size:.75rem}
    .landing-quiet{margin:0 0 2rem;padding:1.2rem;border:1px solid var(--amber);border-radius:var(--radius);background:rgba(247,199,92,.08)}.landing-quiet p{color:var(--text-2)}
    .landing-links{display:flex;flex-wrap:wrap;gap:1rem;margin-top:3rem}.landing-links a{color:var(--mint)}
    @media(max-width:900px){.landing-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.landing-copy{grid-template-columns:1fr;gap:1.5rem}}
    @media(max-width:600px){.landing-shell{width:min(100% - 24px,1180px)}.landing-hero{padding-top:3rem}.landing-card-grid,.landing-hub-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <a class="skip-link" href="#mainContent">Skip to deals</a>
  <nav class="site-nav" aria-label="Primary navigation">
    <div class="site-nav-inner">
      <a class="nav-brand" href="../index.html" aria-label="LootRadar home"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a>
      <div class="nav-links"><a class="active" href="index.html">Deals</a><a href="../methodology.html">How scoring works</a><a href="../recommendations.html">For you</a><a href="../blog.html">Guides</a></div>
    </div>
  </nav>
  <main class="landing-shell" id="mainContent">
    <nav class="landing-breadcrumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span>${definition.isHub ? '<span aria-current="page">PC game deals</span>' : `<a href="index.html">PC game deals</a><span>/</span><span aria-current="page">${escapeHTML(definition.shortLabel)}</span>`}</nav>
    <header class="landing-hero">
      <p class="section-kicker">${escapeHTML(definition.kicker)}</p>
      <h1>${escapeHTML(definition.heading)}</h1>
      <p>${escapeHTML(definition.lede)}</p>
      <time class="landing-time"${snapshot.iso ? ` datetime="${snapshot.iso}"` : ''}>Prices checked ${escapeHTML(snapshot.label)}</time>
    </header>
    <nav class="landing-collection-nav" aria-label="Deal collections"><a href="index.html">All collections</a>${renderCollectionLinks(definition.collections, definition.id)}</nav>
    <section class="landing-copy">
      <div>${definition.introduction.map(paragraph => `<p>${escapeHTML(paragraph)}</p>`).join('')}</div>
      <div><h2>How these deals qualify</h2><p>${escapeHTML(definition.criteria)}</p><p class="landing-caveat">${escapeHTML(definition.caveat)}</p></div>
    </section>
${quietNotice ? `    ${quietNotice}\n` : ''}    ${mainContent}
    <nav class="landing-links" aria-label="Related reading"><a href="index.html">Browse the deals hub</a><a href="../methodology.html">Read the scoring methodology</a>${relatedGuide}<a href="../feed.xml">Deal feed</a></nav>
  </main>
  <footer>
    <div class="footer-inner"><div><a class="nav-brand" href="../index.html"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a><p>Games worth playing. Prices worth paying.</p></div><div class="footer-links"><a href="../methodology.html">Scoring</a><a href="../blog.html">Guides</a><a href="../about.html">About</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></div>
    <p class="footer-disclosure">Some retailer links may earn LootRadar a commission. Price listings come from CheapShark and may change after you leave LootRadar. Affiliate relationships never affect Deal Scores.</p>
  </footer>
  <script src="../lib/analytics.js?v=1"></script>
  <script>
    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-track-deal]');
      if (!link || !window.LootRadarAnalytics) return;
      window.LootRadarAnalytics.track('deal_click', {
        surface: link.dataset.trackSurface,
        store: link.dataset.trackStore,
        priceBucket: window.LootRadarAnalytics.priceBucket(link.dataset.trackPrice)
      });
    });
  </script>
  <script data-goatcounter="https://thelootradar.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

module.exports = { MIN_INDEXABLE_DEALS, renderLandingPage };
