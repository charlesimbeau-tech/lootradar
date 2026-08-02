'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WEEKLY_DIRECTORY = path.join('content', 'weekly-guides');
const ISSUE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;
const SLUG = /^5-pc-game-deals-worth-buying-(\d{4}-\d{2}-\d{2})$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROHIBITED_DASH = new RegExp([
  String.fromCharCode(8212),
  '&m' + 'dash;',
  '&#82' + '12;'
].join('|'), 'i');
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function requireText(value, label, minimum = 1, maximum = 5000) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new TypeError(`${label} must contain ${minimum} to ${maximum} characters.`);
  }
  if (PROHIBITED_DASH.test(trimmed)) throw new TypeError(`${label} contains an em dash.`);
  return trimmed;
}

function requireNumber(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function parseDate(value, label) {
  const parsed = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(parsed.getTime())) {
    throw new TypeError(`${label} must be a valid ISO date.`);
  }
  return parsed;
}

function requireHttpsUrl(value, label, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:') throw new TypeError(`${label} must use HTTPS.`);
  if (allowedHosts && !allowedHosts.includes(parsed.hostname)) {
    throw new TypeError(`${label} uses an unapproved host.`);
  }
  return parsed.toString();
}

function validateWeeklyIssue(issue, options = {}) {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
    throw new TypeError('Weekly issue must be an object.');
  }
  if (issue.schemaVersion !== 1) throw new TypeError('schemaVersion must be 1.');

  const publishedDate = requireText(issue.publishedDate, 'publishedDate', 10, 10);
  const published = parseDate(`${publishedDate}T12:00:00.000Z`, 'publishedDate');
  if (published.toISOString().slice(0, 10) !== publishedDate) {
    throw new TypeError('publishedDate must use YYYY-MM-DD.');
  }

  const slug = requireText(issue.slug, 'slug', 20, 100);
  const slugMatch = slug.match(SLUG);
  if (!slugMatch || slugMatch[1] !== publishedDate) {
    throw new TypeError('slug must contain the published date.');
  }

  requireText(issue.title, 'title', 20, 70);
  requireText(issue.metaDescription, 'metaDescription', 70, 170);
  requireText(issue.socialDescription, 'socialDescription', 50, 170);
  requireText(issue.socialSummary, 'socialSummary', 40, 170);

  if (!Array.isArray(issue.intro) || issue.intro.length !== 2) {
    throw new TypeError('intro must contain exactly two paragraphs.');
  }
  issue.intro.forEach((paragraph, index) => requireText(paragraph, `intro[${index}]`, 80, 700));

  const snapshot = parseDate(issue.snapshotUpdatedAt, 'snapshotUpdatedAt');
  const checked = parseDate(issue.pricesCheckedAt, 'pricesCheckedAt');
  const snapshotGap = checked.getTime() - snapshot.getTime();
  if (snapshotGap < 0 || snapshotGap > SIX_HOURS_MS) {
    throw new TypeError('Prices must be checked within six hours after the deal snapshot.');
  }
  if (options.now) {
    const now = options.now instanceof Date ? options.now : parseDate(options.now, 'now');
    const maxAge = (options.maxSnapshotAgeHours || 6) * 60 * 60 * 1000;
    const age = now.getTime() - snapshot.getTime();
    if (age < 0 || age > maxAge) {
      throw new TypeError(`Deal snapshot must be no more than ${options.maxSnapshotAgeHours || 6} hours old.`);
    }
  }

  if (!Array.isArray(issue.picks) || issue.picks.length !== 5) {
    throw new TypeError('picks must contain exactly five games.');
  }
  const ids = new Set();
  const gameKeys = new Set();
  const titles = new Set();
  issue.picks.forEach((pick, index) => {
    if (!pick || typeof pick !== 'object' || Array.isArray(pick)) {
      throw new TypeError(`picks[${index}] must be an object.`);
    }
    const prefix = `picks[${index}]`;
    const id = requireText(pick.id, `${prefix}.id`, 2, 50);
    if (!SAFE_ID.test(id)) throw new TypeError(`${prefix}.id must be a safe lowercase slug.`);
    const gameKey = requireText(pick.gameKey, `${prefix}.gameKey`, 5, 120);
    if (!/^(?:steam:\d+|title:[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(gameKey)) {
      throw new TypeError(`${prefix}.gameKey must identify a Steam app or normalized title.`);
    }
    const title = requireText(pick.title, `${prefix}.title`, 2, 120);
    const titleKey = title.toLowerCase();
    if (ids.has(id) || gameKeys.has(gameKey) || titles.has(titleKey)) {
      throw new TypeError('Weekly picks must be unique.');
    }
    ids.add(id);
    gameKeys.add(gameKey);
    titles.add(titleKey);
    requireNumber(pick.dealScore, `${prefix}.dealScore`, 0, 100);
    requireNumber(pick.salePrice, `${prefix}.salePrice`, 0, 10000);
    requireNumber(pick.normalPrice, `${prefix}.normalPrice`, 0.01, 10000);
    if (pick.salePrice > pick.normalPrice) {
      throw new TypeError(`${prefix}.salePrice cannot exceed normalPrice.`);
    }
    requireNumber(pick.reviewRating, `${prefix}.reviewRating`, 0, 100);
    requireNumber(pick.reviewCount, `${prefix}.reviewCount`, 0, 100000000);
    requireNumber(pick.discountPercent, `${prefix}.discountPercent`, 0, 100);
    requireText(pick.store, `${prefix}.store`, 2, 80);
    requireText(pick.trackingStore, `${prefix}.trackingStore`, 2, 80);
    requireText(pick.imageAlt, `${prefix}.imageAlt`, 5, 160);
    requireText(pick.copy, `${prefix}.copy`, 100, 900);
    requireHttpsUrl(pick.imageUrl, `${prefix}.imageUrl`);
    const dealUrl = requireHttpsUrl(
      pick.dealUrl,
      `${prefix}.dealUrl`,
      ['www.cheapshark.com']
    );
    if (new URL(dealUrl).pathname !== '/redirect') {
      throw new TypeError(`${prefix}.dealUrl must use the pricing redirect path.`);
    }
  });
  return issue;
}

function loadWeeklyIssues(baseDir) {
  const directory = path.join(baseDir, WEEKLY_DIRECTORY);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(file => ISSUE_FILE.test(file))
    .sort()
    .map(file => {
      const issue = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      validateWeeklyIssue(issue);
      if (`${issue.publishedDate}.json` !== file) {
        throw new TypeError(`${file} does not match its publishedDate.`);
      }
      return issue;
    });
}

function loadCurrentWeeklyIssue(baseDir) {
  const issues = loadWeeklyIssues(baseDir);
  if (!issues.length) throw new Error('No weekly guide issues were found.');
  return issues[issues.length - 1];
}

function weeklyGuideRelativePath(issue) {
  return `blog/${issue.slug}.html`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York'
  }).format(new Date(`${dateString}T12:00:00.000Z`));
}

function formatCheckedAt(value) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York'
  }).format(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
    timeZoneName: 'short'
  }).formatToParts(date);
  const hour = parts.find(part => part.type === 'hour').value;
  const minute = parts.find(part => part.type === 'minute').value;
  const dayPeriod = parts.find(part => part.type === 'dayPeriod').value.toLowerCase()
    .replace('am', 'a.m.')
    .replace('pm', 'p.m.');
  const zone = parts.find(part => part.type === 'timeZoneName').value;
  return `${datePart} at ${hour}:${minute} ${dayPeriod} ${zone}`;
}

function renderPick(pick) {
  return `    <section class="weekly-pick" aria-labelledby="pick-${escapeHtml(pick.id)}">
      <img src="${escapeHtml(pick.imageUrl)}" alt="${escapeHtml(pick.imageAlt)}" loading="lazy" decoding="async">
      <div>
        <p class="weekly-rank">Deal Score ${escapeHtml(pick.dealScore)}</p>
        <h2 id="pick-${escapeHtml(pick.id)}">${escapeHtml(pick.title)}</h2>
        <p class="weekly-price"><strong>$${pick.salePrice.toFixed(2)}</strong> <s>$${pick.normalPrice.toFixed(2)}</s> ${pick.store === 'Steam' ? 'on' : 'at'} ${escapeHtml(pick.store)}</p>
        <p>${escapeHtml(pick.copy)}</p>
        <a class="button button-small" href="${escapeHtml(pick.dealUrl)}" target="_blank" rel="sponsored noopener noreferrer" data-track-deal data-track-store="${escapeHtml(pick.trackingStore)}" data-track-price="${pick.salePrice.toFixed(2)}">Check today's price</a>
      </div>
    </section>`;
}

function renderWeeklyGuide(issue) {
  validateWeeklyIssue(issue);
  const canonical = `https://thelootradar.com/blog/${issue.slug}.html`;
  const published = formatDate(issue.publishedDate);
  const picks = issue.picks.map(renderPick).join('\n\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(issue.title)} | LootRadar</title>
  <meta name="description" content="${escapeHtml(issue.metaDescription)}">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="application/rss+xml" title="LootRadar deals worth attention" href="/feed.xml">

  <meta property="og:title" content="${escapeHtml(issue.title)}">
  <meta property="og:description" content="${escapeHtml(issue.socialDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="LootRadar">
  <meta property="og:image" content="https://thelootradar.com/public/og.png">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(issue.title)}">
  <meta name="twitter:description" content="${escapeHtml(issue.socialSummary)}">
  <meta name="twitter:image" content="https://thelootradar.com/public/og.png">

  <script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: issue.title,
    description: issue.metaDescription,
    author: { '@type': 'Organization', name: 'LootRadar' },
    publisher: { '@type': 'Organization', name: 'LootRadar', url: 'https://thelootradar.com' },
    datePublished: issue.publishedDate,
    dateModified: issue.publishedDate,
    mainEntityOfPage: canonical,
    image: 'https://thelootradar.com/public/og.png'
  }, null, 2)}
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../style.css?v=29">
  <link rel="stylesheet" href="../guides.css?v=1">
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
      <a class="nav-brand" href="../index.html" aria-label="LootRadar home">
        <span class="brand-mark" aria-hidden="true"><i></i></span>
        <span>Loot<span>Radar</span></span>
      </a>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="primaryNavLinks" aria-label="Toggle navigation menu"><i aria-hidden="true"></i></button>
      <div class="nav-links" id="primaryNavLinks">
        <a href="../index.html">Deals</a>
        <a href="../methodology.html">How scoring works</a>
        <a href="../recommendations.html">For you</a>
        <a class="active" href="../blog.html">Guides</a>
        <a data-account-link href="../login.html">Sign in</a>
      </div>
    </div>
  </nav>

  <article class="blog-content weekly-roundup" id="guide-content">
    <p class="section-kicker">The five-deal shortlist</p>
    <h1>${escapeHtml(issue.title)}</h1>
    <p class="meta">Published ${published} &middot; Prices checked ${formatCheckedAt(issue.pricesCheckedAt)}</p>

    ${issue.intro.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n\n    ')}

    <aside class="weekly-note">
      <strong>Read this bit first</strong>
      <p>Every price here is a saved snapshot in U.S. dollars. Retailer price and availability can change after we publish, or in the thirty seconds between you clicking a link and reaching checkout. Those links route through the pricing provider, which may earn a commission from the store. That has never once moved a Deal Score.</p>
    </aside>

${picks}

    <h2>How these five got here</h2>
    <p>All five cleared LootRadar's usual content and quality checks, then finished near the top of the current snapshot on Deal Score. That score weighs player and critic signals, how strong the current price is, how deep the cut goes, how much the reviews prove, and how many people care. Review volume breaks the close ties, so a handful of glowing early ratings cannot impersonate a consensus.</p>

    <p>What no score can tell you is whether a genre suits you or when you will actually find the evening. That part is still your job. The <a href="../methodology.html">LootRadar methodology</a> has the full weighting and the honest limits.</p>

    <div class="cta-box">
      <p>Five not enough?</p>
      <a href="../deals/best-pc-game-deals.html">See the full shortlist &rarr;</a>
    </div>

    <p>Related: <a href="../deals/index.html">Browse every deal collection</a> | <a href="../methodology.html">How the Deal Score is calculated</a></p>
  </article>

  <footer>
    <div class="footer-inner">
      <div><a class="nav-brand" href="../index.html"><span class="brand-mark" aria-hidden="true"><i></i></span><span>Loot<span>Radar</span></span></a><p>Games worth playing. Prices worth paying.</p></div>
      <div class="footer-links"><a href="../methodology.html">Scoring</a><a href="../recommendations.html">For you</a><a href="../blog.html">Guides</a><a data-account-link href="../login.html">Sign in</a><a href="../feed.xml">Deal feed</a><a href="../about.html">About</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div>
    </div>
    <p class="footer-disclosure">LootRadar is funded by advertising. Deal links and prices both come via CheapShark, which may earn a commission from the retailer, and prices can change once you leave. Neither has ever moved a Deal Score.</p>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../supabase-config.js"></script>
  <script src="../lib/site-nav.js?v=1"></script>
  <script src="../lib/guide-page.js?v=1"></script>
  <script src="../lib/auth-nav.js?v=1"></script>
  <script src="../lib/analytics.js?v=2"></script>
  <script>
    document.addEventListener('click', function (event) {
      const link = event.target.closest && event.target.closest('[data-track-deal]');
      if (!link || !window.LootRadarAnalytics) return;
      window.LootRadarAnalytics.track('deal_click', {
        surface: 'weekly_roundup',
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

function renderGuideHero(issue) {
  const href = weeklyGuideRelativePath(issue);
  return `                <!-- WEEKLY_GUIDE_HERO_START -->
                <div class="guides-hero-actions">
                    <a class="button button-primary" href="${escapeHtml(href)}">Read this week's shortlist</a>
                    <a class="button button-secondary" href="deals/index.html">Browse live deal lists</a>
                </div>
                <!-- WEEKLY_GUIDE_HERO_END -->`;
}

function renderGuideFeature(issue) {
  const href = weeklyGuideRelativePath(issue);
  return `        <!-- WEEKLY_GUIDE_FEATURE_START -->
        <article class="guide-feature">
            <div class="guide-feature-visual" aria-hidden="true">
                <span class="guide-feature-radar">05</span>
            </div>
            <div class="guide-feature-copy">
                <p class="guide-feature-status">Current roundup &middot; ${formatDate(issue.publishedDate)}</p>
                <h2>${escapeHtml(issue.title)}</h2>
                <p>Five games where the price and the player reviews both hold up. Every pick comes with the reason it made the cut and the catch you should know about first.</p>
                <a class="guide-feature-link" href="${escapeHtml(href)}">Open the three-minute shortlist</a>
            </div>
        </article>
        <!-- WEEKLY_GUIDE_FEATURE_END -->`;
}

module.exports = {
  SIX_HOURS_MS,
  WEEKLY_DIRECTORY,
  escapeHtml,
  formatDate,
  loadCurrentWeeklyIssue,
  loadWeeklyIssues,
  renderGuideFeature,
  renderGuideHero,
  renderWeeklyGuide,
  validateWeeklyIssue,
  weeklyGuideRelativePath
};
