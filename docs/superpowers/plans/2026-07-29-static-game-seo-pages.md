# Static Game SEO Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a small, stable set of crawlable game-specific deal pages that give search visitors useful price, review, and buying context from LootRadar's current snapshot.

**Architecture:** Add a focused game-page selection module, a static HTML renderer, and a generator that produces one hub plus 24 game pages from quality-qualified Steam-linked deals. Reuse the existing Deal Score dataset, shared navigation, analytics, AdSense, and disclosure patterns. Add the generated routes to the sitemap, static build, scheduled refresh, and permanent deal cards.

**Tech Stack:** Node.js 20+, CommonJS build scripts, static HTML/CSS, existing LootRadar scoring modules, Node test runner.

## Global Constraints

- Do not use em dashes in new customer-facing copy.
- Do not claim that a price is an all-time low unless verified historical data supports it.
- Do not generate pages for bundles, add-ons, Early Access titles, low-confidence titles, or deals without a stable Steam App ID.
- Limit the first release to 24 game pages with at least 80% positive reviews, 1,000 reviews, and a Deal Score of at least 70.
- Preserve GitHub Pages as the production host.
- Keep the current AdSense publisher ID, GoatCounter measurement, affiliate disclosure, and CheapShark redirect requirements.

---

### Task 1: Select stable game-page candidates and routes

**Files:**
- Create: `lib/game-pages.js`
- Test: `tests/game-pages.test.js`

**Interfaces:**
- Consumes: normalized scored deal objects from `buildDealDataset(base, enriched, config)`
- Produces: `gamePageRoute(deal): string`, `selectGamePageDeals(deals, limit?): Deal[]`, `GAME_PAGE_LIMIT: number`

- [ ] **Step 1: Write the failing selection tests**

```js
const {
  GAME_PAGE_LIMIT,
  gamePageRoute,
  selectGamePageDeals
} = require('../lib/game-pages.js');

test('creates readable stable routes with Steam IDs', () => {
  assert.equal(
    gamePageRoute({ title: 'Disco Elysium: The Final Cut', steamAppID: '632470' }),
    'disco-elysium-the-final-cut-632470.html'
  );
});

test('keeps only high-confidence indexable games', () => {
  const selected = selectGamePageDeals([
    qualifiedDeal,
    { ...qualifiedDeal, title: 'Bundle', steamAppID: '2', isBundle: true },
    { ...qualifiedDeal, title: 'Thin reviews', steamAppID: '3', reviewCount: 20 },
    { ...qualifiedDeal, title: 'No Steam ID', steamAppID: '' }
  ]);
  assert.deepEqual(selected.map(deal => deal.title), ['Qualified Game']);
  assert.equal(GAME_PAGE_LIMIT, 24);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/game-pages.test.js`

Expected: FAIL because `lib/game-pages.js` does not exist.

- [ ] **Step 3: Implement candidate selection and route generation**

```js
const { slugify } = require('./deal-normalizer.js');
const GAME_PAGE_LIMIT = 24;

function gamePageRoute(deal) {
  const steamAppID = String(deal?.steamAppID || '').trim();
  const slug = slugify(deal?.title || '');
  if (!steamAppID || !slug) return '';
  return `${slug}-${steamAppID}.html`;
}

function selectGamePageDeals(deals, limit = GAME_PAGE_LIMIT) {
  return deals
    .filter(deal => deal.eligible &&
      !deal.excludedContent &&
      !deal.isBundle &&
      !deal.isEarlyAccess &&
      gamePageRoute(deal) &&
      Number(deal.dealScore) >= 70 &&
      Number(deal.userRating) >= 80 &&
      Number(deal.reviewCount) >= 1000)
    .sort((a, b) => Number(b.dealScore) - Number(a.dealScore) ||
      Number(b.reviewCount) - Number(a.reviewCount))
    .slice(0, Math.max(0, Number(limit) || 0));
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/game-pages.test.js`

Expected: PASS.

### Task 2: Render and generate the game hub and detail pages

**Files:**
- Create: `scripts/templates/game-page.js`
- Create: `scripts/build-game-pages.js`
- Create: `game-pages.css`
- Modify: `tests/game-pages.test.js`
- Generate: `games/index.html`
- Generate: `games/*.html`

**Interfaces:**
- Consumes: `gamePageRoute`, `selectGamePageDeals`, `buildDealDataset`, `deals.json`, and `enriched-deals.json`
- Produces: `renderGameHub(deals, snapshot)`, `renderGamePage(deal, snapshot)`, `buildGamePages(options?)`, and `games/index.html`

- [ ] **Step 1: Add failing renderer and generator tests**

```js
test('renders useful metadata, one H1, current price context, schema, and disclosures', () => {
  const html = renderGamePage(qualifiedDeal, { updatedAt: '2026-07-29T12:00:00Z' });
  assert.match(html, /<title>Qualified Game PC deal and price check \| LootRadar<\/title>/);
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /Prices checked/);
  assert.match(html, /Some retailer links may earn LootRadar a commission/);
  assert.doesNotMatch(html, /all-time low/i);
});

test('writes one hub and the selected game pages', () => {
  const result = buildGamePages({ outputDir, deals: fixtures, snapshot });
  assert.equal(result.routes[0], 'index.html');
  assert.equal(result.routes.length, 2);
  assert.ok(fs.existsSync(path.join(outputDir, 'qualified-game-1.html')));
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `node --test tests/game-pages.test.js`

Expected: FAIL because the renderer and generator are missing.

- [ ] **Step 3: Implement the renderer**

The detail page must include:

- A unique title, meta description, canonical, Open Graph, and X metadata.
- One H1 using the game title.
- A static current offer with store, price, normal price, discount, Deal Score, player rating, and review count.
- Page-specific buying context based on the available genres, rating, review count, price, and Deal Score.
- `Product` plus `BreadcrumbList` JSON-LD using the current cached offer.
- A direct store button with `rel="sponsored noopener noreferrer"` and GoatCounter event tracking.
- Links to the games hub, current deal collections, methodology, and relevant guides.
- The existing AdSense publisher code and affiliate disclosure.

The hub must contain static cards for all selected pages, an explanation of the selection rules, a current snapshot timestamp, and conventional anchor links to every detail page.

- [ ] **Step 4: Implement the generator**

`buildGamePages(options)` must load the scored dataset when fixtures are not supplied, delete only previously generated `.html` files inside the exact `games` output directory, write the hub, write 24 selected pages, and return `{ outputDir, routes, deals }`.

- [ ] **Step 5: Add responsive shared styling**

Create `game-pages.css` for the game hub, detail hero, score summary, evidence grid, offer card, related links, and mobile stacking. Reuse the existing color and typography variables from `style.css`.

- [ ] **Step 6: Run the focused tests**

Run: `node --test tests/game-pages.test.js`

Expected: PASS.

### Task 3: Connect game pages to deal collections and site navigation

**Files:**
- Modify: `scripts/build-search-pages.js`
- Modify: `scripts/templates/deal-landing.js`
- Modify: `index.html`
- Modify: `tests/search-pages.test.js`

**Interfaces:**
- Consumes: `selectGamePageDeals(deals)` and `gamePageRoute(deal)`
- Produces: crawlable links from qualifying deal cards and the homepage quick-link navigation to `/games/`

- [ ] **Step 1: Add failing link tests**

```js
assert.match(bestPage, /\.\.\/games\/co-op-indie-pick-1-1\.html/);
assert.match(bestPage, />Price details<\/a>/);
```

- [ ] **Step 2: Run the search-page tests and confirm failure**

Run: `node --test tests/search-pages.test.js`

Expected: FAIL because deal cards do not link to game detail pages.

- [ ] **Step 3: Pass the selected game route set into the renderer**

`buildSearchPages` must create a route set from `selectGamePageDeals(deals)` and pass it with each page definition. `renderDealCard` must add a separate `Price details` link only when that deal has a generated page. The store CTA remains visually primary and keeps its analytics attributes.

- [ ] **Step 4: Add the games hub to homepage quick links**

Add a conventional link to `games/index.html` labeled `Game price checks`.

- [ ] **Step 5: Run the search-page tests**

Run: `node --test tests/search-pages.test.js`

Expected: PASS.

### Task 4: Add generated pages to sitemap, build, verification, and refresh automation

**Files:**
- Modify: `scripts/generate-sitemap.js`
- Modify: `scripts/build-static.js`
- Modify: `scripts/verify-site.js`
- Modify: `package.json`
- Modify: `.github/workflows/update-deals.yml`
- Modify: `tests/sitemap.test.js`
- Modify: `tests/workflow-refresh.test.js`
- Generate: `sitemap.xml`

**Interfaces:**
- Consumes: generated routes from `games/*.html`
- Produces: canonical `/games/` sitemap entries, deployable static output, and scheduled refresh commits

- [ ] **Step 1: Add failing sitemap and workflow tests**

```js
assert.match(xml, /<loc>https:\/\/thelootradar\.com\/games\/index\.html<\/loc>/);
assert.match(xml, /<loc>https:\/\/thelootradar\.com\/games\/qualified-game-1\.html<\/loc>/);
assert.match(workflow, /node scripts\/build-game-pages\.js/);
assert.match(workflow, /\[ -d games \] && git add games/);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/sitemap.test.js tests/workflow-refresh.test.js`

Expected: FAIL because game pages are not yet integrated.

- [ ] **Step 3: Integrate the build sequence**

Update `npm run build` to generate game pages before search landing pages and the sitemap. Add `games` to the static output directories and `game-pages.css` to root assets.

- [ ] **Step 4: Integrate sitemap discovery**

Add `indexableGamePaths(baseDir)` that reads generated `.html` files from `games`, requires canonical metadata, and returns `/games/index.html` plus the detail paths. Use the snapshot date for these current-price pages.

- [ ] **Step 5: Integrate verification and scheduled refresh**

Verify that all generated game pages have a canonical, one H1, metadata, schema, analytics, disclosures, and sitemap membership. Run `build-game-pages.js` before search pages in the scheduled workflow and stage `games`, `game-pages.css`, and `sitemap.xml`.

- [ ] **Step 6: Generate production artifacts**

Run:

```text
node scripts/build-game-pages.js
node scripts/build-search-pages.js
node scripts/generate-sitemap.js
```

Expected: one game hub, 24 detail pages, collection links, and a sitemap containing those routes.

- [ ] **Step 7: Run full validation**

Run:

```text
npm test
npm run build
npm run verify
```

Expected: all tests pass, the deployment build completes, and verification reports no missing canonical pages or assets.

### Task 5: Review the generated release

**Files:**
- Review: `games/index.html`
- Review: three representative `games/*.html` pages
- Review: `deals/best-pc-game-deals.html`
- Review: `sitemap.xml`

**Interfaces:**
- Consumes: the completed generated release
- Produces: a verified first SEO page set ready for intentional commit and deployment

- [ ] **Step 1: Check content quality**

Confirm that generated pages use accurate snapshot values, do not overstate price history, do not contain bundles, contain no em dashes, and provide more value than a title plus store link.

- [ ] **Step 2: Check crawlability**

Confirm that each page is reachable from the games hub, qualifying cards link to detail pages, every page has one canonical URL, and every generated route appears exactly once in the sitemap.

- [ ] **Step 3: Check the worktree**

Run: `git status --short`

Expected: only the planned SEO implementation plus pre-existing unrelated user files are present. Do not stage or commit unrelated files.

