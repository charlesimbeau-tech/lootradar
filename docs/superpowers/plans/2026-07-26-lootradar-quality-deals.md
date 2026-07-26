# LootRadar Quality-First Deal Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing static LootRadar aggregator into a transparent, quality-first deal finder that ranks games worth playing at prices worth paying.

**Architecture:** Keep the zero-backend HTML/CSS/JavaScript site, GitHub Actions refresh pipeline, CheapShark redirects, and optional Supabase account flow. Add focused browser/Node-compatible modules for normalization, editorial policy, scoring, filtering, URL state, and local watchlists; use user-triggered CheapShark deal lookups for historical-low details instead of rate-limit-heavy bulk scraping.

**Tech Stack:** HTML5, CSS, browser JavaScript, Node.js 20 built-in test runner, CheapShark, Steam/SteamSpy enrichment, GitHub Actions, GitHub Pages.

## Global Constraints

- Default discovery must prioritize game quality, price value, review credibility, and player interest over raw discount percentage.
- Do not invent API keys or credentials.
- Exclude DLC, demos, soundtracks, virtual currency, cosmetic packs, unrelated software, obvious shovelware, and low-confidence titles by default.
- Preserve basic browsing without an account and store anonymous watchlist state locally.
- Treat scores and incomplete third-party data as estimates; prices and availability can change.
- Follow CheapShark rate limits and use CheapShark redirects for purchases.

---

### Task 1: Scoring, normalization, and editorial policy

**Files:**
- Create: `config/editorial-config.js`
- Create: `lib/deal-normalizer.js`
- Create: `lib/deal-score.js`
- Create: `tests/deal-score.test.js`
- Create: `tests/deal-normalizer.test.js`

**Interfaces:**
- Consumes: raw CheapShark deal rows and optional Steam metadata.
- Produces: `normalizeDeal(raw, stores)`, `calculateDealScore(deal, config)`, `getDefaultEligibility(deal, config)`, and `createRecommendationReason(deal, result)`.

- [ ] **Step 1: Write failing tests for score ordering and title exclusions**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDealScore } = require('../lib/deal-score.js');

test('an acclaimed strong deal outranks a mediocre 90%-off game', () => {
  const excellent = calculateDealScore({ userRating: 94, reviewCount: 48000, criticScore: 90, discount: 60, dealRating: 9.2, salePrice: 19.99, normalPrice: 49.99 });
  const mediocre = calculateDealScore({ userRating: 58, reviewCount: 220, criticScore: 52, discount: 90, dealRating: 7.5, salePrice: 1.99, normalPrice: 19.99 });
  assert.ok(excellent.score > mediocre.score);
});
```

- [ ] **Step 2: Run tests and verify module-not-found failures**

Run: `node --test tests/*.test.js`
Expected: FAIL because scoring and normalization modules do not exist.

- [ ] **Step 3: Implement normalized deal fields, tunable weights, confidence, penalties, and recommendation reasons**

```js
const DEFAULT_WEIGHTS = Object.freeze({ quality: 35, priceValue: 25, discount: 20, confidence: 10, interest: 10 });
function clamp(value, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }
function calculateDealScore(deal, config = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(config.weights || {}) };
  // Calculate five 0-100 components, apply explicit data-quality/content
  // penalties, clamp the final score, and return the complete breakdown.
}
```

- [ ] **Step 4: Run scoring and normalization tests**

Run: `node --test tests/deal-score.test.js tests/deal-normalizer.test.js`
Expected: PASS, including excellent/mediocre/modest-discount examples.

### Task 2: Quality-first homepage and shareable filters

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`
- Create: `lib/deal-filters.js`
- Create: `tests/deal-filters.test.js`

**Interfaces:**
- Consumes: normalized scored deals from Task 1.
- Produces: `filterDeals(deals, filters)`, `sortDeals(deals, sort)`, `readFiltersFromUrl(url)`, and `writeFiltersToUrl(filters)`.

- [ ] **Step 1: Write failing URL/filter tests**

```js
test('default quality mode rejects DLC and low-confidence games', () => {
  const visible = filterDeals(fixtures, { quality: 'recommended', includeDlc: false });
  assert.deepEqual(visible.map(game => game.slug), ['excellent-game']);
});
```

- [ ] **Step 2: Run the filter test and verify failure**

Run: `node --test tests/deal-filters.test.js`
Expected: FAIL because `lib/deal-filters.js` does not exist.

- [ ] **Step 3: Implement curated collections, responsive cards, accessible controls, URL state, sorting, loading, errors, and empty states**

```js
const COLLECTIONS = {
  best: deal => deal.eligible && deal.dealScore >= 70,
  under10: deal => deal.eligible && deal.salePrice <= 10 && deal.userRating >= 80,
  deepWorthIt: deal => deal.eligible && deal.discount >= 70 && deal.dealScore >= 65,
  hiddenGems: deal => deal.eligible && deal.userRating >= 85 && deal.reviewCount >= 100 && deal.reviewCount < 5000
};
```

- [ ] **Step 4: Verify filters and static runtime**

Run: `node --test tests/deal-filters.test.js && node --check app.js`
Expected: PASS and no syntax errors.

### Task 3: Detail view, historical context, and watchlist

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: a selected scored deal and `GET /api/1.0/deals?id={dealID}` on explicit user action.
- Produces: an accessible detail dialog, historical-low comparison, score breakdown, current alternate stores, local watchlist, target-price state, and reached-target alerts.

- [ ] **Step 1: Add user-triggered detail lookup with abort and error states**

```js
async function loadDealDetails(dealID, signal) {
  const response = await fetch(`${API}/deals?id=${encodeURIComponent(dealID)}`, { signal });
  if (!response.ok) throw new Error(`Deal details unavailable (${response.status})`);
  return response.json();
}
```

- [ ] **Step 2: Add local watchlist storage**

```js
function saveWatch(item) {
  const next = { ...loadWatchlist(), [item.key]: item };
  localStorage.setItem('lr_watchlist_v1', JSON.stringify(next));
  return next;
}
```

- [ ] **Step 3: Add keyboard-safe dialog behavior and price-comparison UI**

Use a native `<dialog>`, restore focus on close, label every control, and describe the chart values in visible text.

- [ ] **Step 4: Run syntax and runtime checks**

Run: `node --check app.js`
Expected: no output and exit code 0.

### Task 4: Transparency, SEO, configuration, and owner documentation

**Files:**
- Create: `methodology.html`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `about.html`
- Modify: `sitemap.xml`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: the exact scoring policy and source limitations from Tasks 1–3.
- Produces: a public ranking explanation, owner-adjustable configuration guide, source/legal limitations, setup steps, and accurate metadata.

- [ ] **Step 1: Document the exact formula and three calculations**

```text
Deal Score = quality×0.35 + price value×0.25 + discount×0.20
           + review confidence×0.10 + interest×0.10 − penalties
```

- [ ] **Step 2: Document source behavior and environment configuration**

List CheapShark as the pricing source, Steam/SteamSpy as metadata enrichment, Supabase as optional sync, and state that time-series history, console pricing, Steam Deck verification, email alerts, and publisher batch analysis require additional licensed data.

- [ ] **Step 3: Add canonical metadata, structured data, methodology sitemap entry, and accurate update language**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`.

### Task 5: Build, regression validation, and deployment

**Files:**
- Create: `package.json`
- Create: `scripts/build-static.js`
- Create: `worker/index.js`
- Create: `.openai/hosting.json` during Sites provisioning

**Interfaces:**
- Consumes: the validated static source tree.
- Produces: `dist/server/index.js`, `dist/static/**`, a saved Sites version, and a private production URL.

- [ ] **Step 1: Add repeatable test/build commands**

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "build": "node scripts/build-static.js"
  }
}
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npm run build`
Expected: all tests pass and the deployment bundle is created.

- [ ] **Step 3: Verify core local routes and generated files**

Run: `node scripts/verify-site.js`
Expected: homepage, methodology, data, scripts, manifest, and required deployment files all report OK.

- [ ] **Step 4: Publish the exact validated source**

Save the source state, package the deployment output, deploy privately through Sites, and poll until the production deployment succeeds.

