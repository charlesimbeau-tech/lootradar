# Homepage Discovery Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage sort dropdown with five self-ranking discovery tabs while making the unfiltered catalog alphabetical and filtered catalog Recommended.

**Architecture:** Keep deal membership and automatic ordering as pure functions in `lib/deal-filters.js`, then have both the browser app and static fallback call those functions. The homepage configuration owns the five visible tabs; `all` remains an internal neutral collection state but is not rendered as a tab. Existing permanent deal pages keep their current selection rules and routes.

**Tech Stack:** Browser JavaScript, CommonJS-compatible UMD modules, static HTML/CSS, Node.js built-in test runner, GitHub Pages.

## Global Constraints

- The homepage banner contains exactly Best right now, Free today, $5 finds, New arrivals, and Hidden gems.
- The homepage has no All deals tab and no sort dropdown.
- The neutral catalog is alphabetical; search or generic filters without a tab use Recommended ranking.
- Free today is exactly `$0`; $5 finds is greater than `$0` and no more than `$5`.
- Clicking the active tab deselects it; Reset Filters returns to the neutral alphabetical catalog.
- Generic filters narrow an active discovery section without overriding that section's ranking.
- Permanent collection pages and the Deals hub remain available.

---

### Task 1: Pure discovery membership and automatic ordering

**Files:**
- Modify: `lib/deal-filters.js`
- Modify: `config/editorial-config.js`
- Test: `tests/deal-filters.test.js`

**Interfaces:**
- Produces: `effectiveSort(filters): "title" | "recommended" | "release"`
- Produces: `toggleCollection(currentId, clickedId): string`
- Extends: `matchesCollection(deal, collection, now)` with `free` and `five`
- Changes: `DEFAULT_FILTERS.collection` from `best` to internal neutral state `all`
- Removes: visible/manual `sort` from `DEFAULT_FILTERS`

- [ ] **Step 1: Write failing tests for the new collection boundaries**

Add fixtures and assertions to `tests/deal-filters.test.js`:

```js
test('free today and five-dollar finds never overlap', () => {
  const free = { ...fixtures[0], slug: 'free', salePrice: 0 };
  const five = { ...fixtures[0], slug: 'five', salePrice: 5 };
  const over = { ...fixtures[0], slug: 'over', salePrice: 5.01 };

  assert.deepEqual(
    filterDeals([free, five, over], { collection: 'free' }).map(game => game.slug),
    ['free']
  );
  assert.deepEqual(
    filterDeals([free, five, over], { collection: 'five' }).map(game => game.slug),
    ['five']
  );
});
```

- [ ] **Step 2: Write failing tests for automatic ordering and tab toggling**

Import `DEFAULT_FILTERS`, `effectiveSort`, and `toggleCollection`, then add:

```js
test('homepage ordering follows neutral, filtered, and discovery states', () => {
  assert.equal(DEFAULT_FILTERS.collection, 'all');
  assert.equal(effectiveSort(DEFAULT_FILTERS), 'title');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, q: 'portal' }), 'recommended');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, maxPrice: 10 }), 'recommended');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, collection: 'fresh' }), 'release');
  assert.equal(effectiveSort({ ...DEFAULT_FILTERS, collection: 'hidden' }), 'recommended');
});

test('clicking the active discovery tab returns to the neutral catalog', () => {
  assert.equal(toggleCollection('all', 'free'), 'free');
  assert.equal(toggleCollection('free', 'free'), 'all');
  assert.equal(toggleCollection('free', 'hidden'), 'hidden');
});

test('alphabetical ordering uses game titles', () => {
  const rows = [{ title: 'Zulu' }, { title: 'alpha' }, { title: 'Beta' }];
  assert.deepEqual(sortDeals(rows, 'title').map(row => row.title), ['alpha', 'Beta', 'Zulu']);
});
```

- [ ] **Step 3: Run the focused tests and confirm the red state**

Run: `node --test tests/deal-filters.test.js`

Expected: FAIL because `free`, `five`, `effectiveSort`, `toggleCollection`, and title sorting do not exist yet, and the default collection is still `best`.

- [ ] **Step 4: Implement the pure filter helpers**

In `lib/deal-filters.js`, make the neutral defaults omit manual sorting:

```js
const DEFAULT_FILTERS = Object.freeze({
  q: '',
  collection: 'all',
  store: 'all',
  genre: 'all',
  maxPrice: 70,
  minDiscount: 0,
  minRating: 70,
  minReviews: 100,
  quality: 'recommended',
  includeDlc: false,
  includeEarlyAccess: false,
  includeBundles: false
});
```

Extend `matchesCollection`:

```js
case 'free': return Number(deal.salePrice) === 0;
case 'five': return Number(deal.salePrice) > 0 && Number(deal.salePrice) <= 5;
```

Add the state helpers:

```js
function hasGenericFilters(input = {}) {
  const filters = normalizeFilters(input);
  return filters.q !== DEFAULT_FILTERS.q ||
    filters.store !== DEFAULT_FILTERS.store ||
    filters.genre !== DEFAULT_FILTERS.genre ||
    filters.maxPrice !== DEFAULT_FILTERS.maxPrice ||
    filters.minDiscount !== DEFAULT_FILTERS.minDiscount ||
    filters.minRating !== DEFAULT_FILTERS.minRating ||
    filters.minReviews !== DEFAULT_FILTERS.minReviews ||
    filters.quality !== DEFAULT_FILTERS.quality ||
    filters.includeDlc !== DEFAULT_FILTERS.includeDlc ||
    filters.includeEarlyAccess !== DEFAULT_FILTERS.includeEarlyAccess ||
    filters.includeBundles !== DEFAULT_FILTERS.includeBundles;
}

function effectiveSort(input = {}) {
  const filters = normalizeFilters(input);
  if (filters.collection === 'fresh') return 'release';
  if (filters.collection !== 'all') return 'recommended';
  return hasGenericFilters(filters) ? 'recommended' : 'title';
}

function toggleCollection(currentId, clickedId) {
  return currentId === clickedId ? 'all' : clickedId;
}
```

Add a case-insensitive title comparator to `sortDeals`:

```js
title: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, {
  sensitivity: 'base'
}),
```

Export `hasGenericFilters`, `effectiveSort`, and `toggleCollection`.

- [ ] **Step 5: Set the five visible discovery sections**

Replace `config.collections` in `config/editorial-config.js` with:

```js
collections: Object.freeze([
  { id: 'best', label: 'Best right now' },
  { id: 'free', label: 'Free today' },
  { id: 'five', label: '$5 finds' },
  { id: 'fresh', label: 'New arrivals' },
  { id: 'hidden', label: 'Hidden gems' }
])
```

- [ ] **Step 6: Run the focused tests and confirm green**

Run: `node --test tests/deal-filters.test.js`

Expected: all tests pass, including non-overlapping price collections, automatic ordering, title sorting, and tab toggling.

- [ ] **Step 7: Commit the pure behavior**

```powershell
git add -- lib/deal-filters.js config/editorial-config.js tests/deal-filters.test.js
git commit -m "Define homepage discovery section behavior"
```

---

### Task 2: Remove manual sorting and wire self-ranking tabs

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`
- Modify: `scripts/build-home-fallback.js`
- Test: `tests/home-fallback.test.js`

**Interfaces:**
- Consumes: `effectiveSort(filters)` and `toggleCollection(currentId, clickedId)` from Task 1
- Consumes: `config.collections` as the complete visible tab list
- Preserves: internal `collection: "all"` as the no-tab-selected state

- [ ] **Step 1: Write failing structural tests for the homepage controls**

Add to `tests/home-fallback.test.js`:

```js
test('the homepage uses five discovery tabs and no manual sort control', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const config = require('../config/editorial-config.js');

  assert.doesNotMatch(html, /id="sortSelect"/);
  assert.deepEqual(
    config.collections.map(collection => collection.id),
    ['best', 'free', 'five', 'fresh', 'hidden']
  );
  assert.match(app, /effectiveSort\(state\.filters\)/);
  assert.match(app, /toggleCollection\(state\.filters\.collection, button\.dataset\.collection\)/);
});
```

Update the existing homepage collection-row assertion to expect the same five IDs and no `all` entry.

- [ ] **Step 2: Write failing static-fallback tests for neutral ordering**

Import `effectiveSort` in `tests/home-fallback.test.js` and add a fixture with deliberately unordered titles. Assert that `buildHomeFallback` writes the titles alphabetically after excluding the hero, and that its returned `visible` count still includes the entire neutral catalog.

```js
test('the static neutral catalog is baked alphabetically', () => {
  const { indexPath, base } = scaffold();
  const deals = [
    { ...fixture(0), key: 'steam:z', title: 'Zulu' },
    { ...fixture(1), key: 'steam:a', title: 'Alpha' },
    { ...fixture(2), key: 'steam:b', title: 'Beta' }
  ];
  buildHomeFallback({ base, deals, indexPath });
  const html = fs.readFileSync(indexPath, 'utf8');
  const rendered = [...html.matchAll(/class="card-title"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(rendered, ['Alpha', 'Beta']);
});
```

The fixture with the highest Recommended score remains the hero and is withheld from the untouched default grid.

- [ ] **Step 3: Run the UI-focused tests and confirm the red state**

Run: `node --test tests/home-fallback.test.js`

Expected: FAIL because `sortSelect` remains in the markup, the app reads it, and the fallback still uses `DEFAULT_FILTERS.sort`.

- [ ] **Step 4: Remove the sort dropdown and close the layout gap**

In `index.html`, delete the entire `label.select-field` containing `#sortSelect`.

In `style.css`, change the desktop search grid:

```css
.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: .7rem;
  margin-top: 2.2rem;
}
```

In the `max-width: 820px` media query, keep `grid-template-columns: minmax(0, 1fr) 105px` and remove the rule that forces `.search-box` across all columns. Search and Filters should remain side by side at narrow widths.

- [ ] **Step 5: Wire automatic ordering and toggleable tabs in `app.js`**

Destructure the new helpers:

```js
const {
  DEFAULT_FILTERS,
  normalizeFilters,
  consolidateHomepageFilters,
  effectiveSort,
  toggleCollection,
  filterDeals,
  sortDeals,
  readFiltersFromUrl,
  filtersToSearchParams
} = window.LootRadarFilters;
```

Keep only these visible collection definitions plus the internal neutral copy:

```js
const collections = {
  best: { label: 'Best right now', title: 'The best of what is live right now', summary: 'Games people actually rate, at prices that actually moved.' },
  free: { label: 'Free today', title: 'Good games that cost nothing today', summary: 'Full games at exactly $0 that still cleared the quality checks.' },
  five: { label: '$5 finds', title: 'Worthwhile games for five dollars or less', summary: 'Paid games from one cent through five dollars, strongest first.' },
  fresh: { label: 'New arrivals', title: 'Out recently, already loved', summary: 'Released in the last year, already discounted, already carrying real reviews.' },
  hidden: { label: 'Hidden gems', title: 'Adored by everyone who found them', summary: 'Smaller crowds, unusually happy ones, and enough reviews to trust.' },
  all: { label: 'All deals', title: 'Every qualified deal from A to Z', summary: 'The complete qualified catalog, alphabetical until you search or filter.' }
};
```

Remove every `#sortSelect` read/write. In `render`, derive ordering:

```js
state.visibleDeals = sortDeals(filtered, effectiveSort(state.filters));
```

In the collection click handler, toggle the active tab:

```js
state.filters.collection = toggleCollection(
  state.filters.collection,
  button.dataset.collection
);
```

The existing `syncFormFromState()` call then refreshes every tab's `aria-selected` state. `resetFilters()` already restores `DEFAULT_FILTERS`, which now means `all` and alphabetical.

Make the hero independent of the neutral catalog by selecting the Best collection explicitly:

```js
const heroFilters = { ...DEFAULT_FILTERS, collection: 'best' };
const top = sortDeals(filterDeals(state.allDeals, heroFilters), 'recommended')[0];
```

- [ ] **Step 6: Make the static fallback use the same ordering**

In `scripts/build-home-fallback.js`, import `effectiveSort`. Replace `DEFAULT_FILTERS.sort` with `effectiveSort(DEFAULT_FILTERS)`. Select the static hero with `{ ...DEFAULT_FILTERS, collection: 'best' }` and Recommended ordering, matching `app.js`.

- [ ] **Step 7: Bump browser cache versions**

In `index.html`, increment the query versions for `config/editorial-config.js`, `lib/deal-filters.js`, and `app.js` so deployed visitors do not mix the new HTML with cached state logic.

- [ ] **Step 8: Run the focused UI tests and confirm green**

Run: `node --test tests/deal-filters.test.js tests/home-fallback.test.js`

Expected: all tests pass; the markup has no sort control, the fallback is alphabetical, and the configured tab list matches the design.

- [ ] **Step 9: Commit the homepage integration**

```powershell
git add -- index.html style.css app.js scripts/build-home-fallback.js tests/home-fallback.test.js
git commit -m "Replace homepage sorting with discovery tabs"
```

---

### Task 3: Rebuild, verify, and publish

**Files:**
- Regenerate: `index.html`
- Regenerate as changed: `deals/*.html`, `sitemap.xml`, and other tracked build outputs selected by `git diff`
- Verify: full repository and production homepage

**Interfaces:**
- Consumes: all behavior from Tasks 1 and 2
- Produces: deployed GitHub Pages site with a cache-safe homepage

- [ ] **Step 1: Rebuild all static outputs**

Run: `npm run build`

Expected: exit 0; the log reports the full neutral homepage count and 24 baked cards. Restore any unrelated generated timestamp-only change such as `game-pages-archive.json` after confirming the worktree was clean before the build.

- [ ] **Step 2: Run the complete automated verification**

Run:

```powershell
npm test
npm run verify
git diff --check
```

Expected: every Node test passes, site verification reports all source/build assets and canonical pages valid, and `git diff --check` emits no errors.

- [ ] **Step 3: Browser-check the desktop interaction**

Serve the repository locally with a hidden `py -m http.server` process and inspect the homepage in the browser. Confirm:

```text
No sort dropdown
Exactly five discovery tabs
No selected tab on initial load
Initial deal titles are alphabetical
Search or a generic filter changes ordering to Recommended
Best right now selects and ranks by Deal Score
Free today contains only $0 games
$5 finds contains prices from $0.01 through $5
New arrivals ranks newest release first
Clicking the active tab clears its selected state
Reset Filters restores the alphabetical catalog
```

- [ ] **Step 4: Browser-check a narrow viewport**

At a viewport around 390 CSS pixels wide, confirm Search and Filters fit without the removed select leaving whitespace, the tablist remains horizontally scrollable, and no control is clipped.

- [ ] **Step 5: Commit regenerated source outputs**

Review `git diff --stat` and stage only files attributable to this feature:

```powershell
git add -u
git diff --cached --check
git commit -m "Rebuild homepage discovery catalog"
```

- [ ] **Step 6: Push and wait for the matching deployment**

```powershell
git fetch origin
git status -sb
git push origin main
$headSha = git rev-parse HEAD
$pagesRun = gh run list --limit 10 --json databaseId,workflowName,status,conclusion,headSha,url |
  ConvertFrom-Json |
  Where-Object { $_.workflowName -eq 'pages-build-deployment' -and $_.headSha -eq $headSha } |
  Select-Object -First 1
if (-not $pagesRun) { throw "No Pages deployment found for $headSha" }
gh run watch $pagesRun.databaseId --exit-status
```

Expected: the Pages run for the pushed `HEAD` completes successfully.

- [ ] **Step 7: Verify production rather than the local build**

Set `$shortSha = git rev-parse --short HEAD`, open `https://thelootradar.com/?deploy=$shortSha`, and confirm the deployed asset versions, tab names, initial alphabetical order, tab toggling, price boundaries, and Reset Filters behavior. Finally verify `git rev-parse HEAD` equals `git rev-parse origin/main` and `git status --short` is empty.
