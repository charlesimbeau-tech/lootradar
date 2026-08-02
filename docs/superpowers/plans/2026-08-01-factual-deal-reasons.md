# Factual Deal Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace conversational deal-recommendation prose with compact, factual stat lines across every generated LootRadar surface.

**Architecture:** Keep `createRecommendationReason()` as the single copy source inside the scoring module. Specify every data-dependent branch with unit tests, then rebuild the alert snapshot, homepage, deal collection pages, RSS feed, and ignored deployment bundle from the unchanged deal data.

**Tech Stack:** Node.js 20+, CommonJS, Node test runner, repository build and verification scripts

## Global Constraints

- Separate facts with the middle dot character: ` · `.
- Use compact review counts with uppercase `K` and `M` suffixes.
- Retain two decimal places for dollar differences above a recorded low.
- Do not emit `frankly silly`, `hefty`, `proper cut`, `the game itself is doing the work`, `price looks sharp`, or other editorial commentary.
- Do not change Deal Score calculation, ranking, filtering, or eligibility.
- The supported factual results are player rating/review count with discount, recorded-low status, amount above recorded low, critic-only evidence, discount-only evidence, and no usable evidence.

---

## File structure

- `lib/deal-score.js`: formats compact counts and produces the canonical factual recommendation string.
- `tests/deal-score.test.js`: pins every recommendation branch and the uppercase count suffix.
- `alert-deals.json`: persisted notification snapshot rebuilt through `scripts/build-alert-snapshot.js`.
- `index.html`: prerendered homepage deal reasons rebuilt through `scripts/build-home-fallback.js` as part of `npm run build`.
- `deals/best-pc-game-deals.html`: generated collection copy.
- `deals/co-op-game-deals.html`: generated collection copy.
- `deals/deep-discounts.html`: generated collection copy.
- `deals/hidden-gems.html`: generated collection copy.
- `deals/indie-game-deals.html`: generated collection copy.
- `deals/new-game-deals.html`: generated collection copy.
- `deals/steam-deals-under-10.html`: generated collection copy.
- `feed.xml`: generated RSS recommendation copy rebuilt through `scripts/generate-rss.js`.
- `dist/static/`: ignored deployment bundle rebuilt and checked by `npm run verify`.

### Task 1: Canonical factual recommendation generator

**Files:**
- Modify: `tests/deal-score.test.js`
- Modify: `lib/deal-score.js:146-168`

**Interfaces:**
- Consumes: `createRecommendationReason(deal, result?)`, where `deal` is a normalized deal object and `result` is an optional `calculateDealScore()` result.
- Produces: a plain string whose facts are separated by ` · `; `buildDealDataset()` continues consuming the same function without interface changes.

- [ ] **Step 1: Write failing tests for every approved copy branch**

Replace the scoring import and append the following tests in `tests/deal-score.test.js`:

```js
const {
  calculateDealScore,
  createRecommendationReason,
  getDefaultEligibility
} = require('../lib/deal-score.js');

test('recommendation reason uses a factual stat line with uppercase compact counts', () => {
  assert.equal(
    createRecommendationReason({
      userRating: 86,
      reviewCount: 45900,
      discount: 90,
      salePrice: 4.99,
      normalPrice: 49.99
    }),
    '86% positive · 45.9K reviews · 90% off'
  );
});

test('recommendation reason states recorded-low evidence directly', () => {
  assert.equal(
    createRecommendationReason({
      userRating: 94,
      reviewCount: 48000,
      discount: 60,
      salePrice: 19.99,
      historicalLow: 19.99
    }),
    '94% positive · 48K reviews · Recorded low'
  );
  assert.equal(
    createRecommendationReason({
      userRating: 94,
      reviewCount: 48000,
      discount: 40,
      salePrice: 22.14,
      historicalLow: 19.99
    }),
    '94% positive · 48K reviews · $2.15 above recorded low'
  );
});

test('recommendation reason describes limited rating evidence without commentary', () => {
  assert.equal(
    createRecommendationReason({ criticScore: 82, discount: 70 }),
    'Critic score 82 · Player rating unavailable'
  );
  assert.equal(
    createRecommendationReason({ discount: 90 }),
    '90% off · Rating data unavailable'
  );
  assert.equal(createRecommendationReason({}), 'Rating data unavailable');
});
```

- [ ] **Step 2: Run the focused test and verify the old copy fails**

Run:

```powershell
node --test tests/deal-score.test.js
```

Expected: three new tests fail because the generator still emits sentence-style copy and lowercase `k`.

- [ ] **Step 3: Implement the factual formatter**

In `lib/deal-score.js`, change the `formatCount()` thousands suffix and replace `createRecommendationReason()` with:

```js
  function formatCount(value) {
    const count = Number(value || 0);
    if (count >= 1000000) return `${round(count / 1000000, 1)}M`;
    if (count >= 1000) return `${round(count / 1000, 1)}K`;
    return String(count);
  }

  function createRecommendationReason(deal, result = calculateDealScore(deal)) {
    const separator = ' · ';
    if (deal.userRating && deal.reviewCount) {
      const facts = [
        `${deal.userRating}% positive`,
        `${formatCount(deal.reviewCount)} reviews`
      ];
      if (result.usesHistoricalLow && deal.historicalLow) {
        const difference = Number(deal.salePrice) - Number(deal.historicalLow);
        facts.push(
          difference <= 0.01
            ? 'Recorded low'
            : `$${difference.toFixed(2)} above recorded low`
        );
      } else if (Number(deal.discount) > 0) {
        facts.push(`${Number(deal.discount)}% off`);
      }
      return facts.join(separator);
    }
    if (deal.criticScore) {
      return `Critic score ${deal.criticScore}${separator}Player rating unavailable`;
    }
    if (Number(deal.discount) > 0) {
      return `${Number(deal.discount)}% off${separator}Rating data unavailable`;
    }
    return 'Rating data unavailable';
  }
```

- [ ] **Step 4: Run the focused and full test suites**

Run:

```powershell
node --test tests/deal-score.test.js
npm test
```

Expected: all deal-score tests pass, followed by the entire repository suite passing with zero failures.

- [ ] **Step 5: Commit the tested source change**

```powershell
git add -- lib/deal-score.js tests/deal-score.test.js
git commit -m "fix: make deal reasons factual"
```

### Task 2: Refresh and verify every published copy surface

**Files:**
- Modify: `alert-deals.json`
- Modify: `index.html`
- Modify: `deals/best-pc-game-deals.html`
- Modify: `deals/co-op-game-deals.html`
- Modify: `deals/deep-discounts.html`
- Modify: `deals/hidden-gems.html`
- Modify: `deals/indie-game-deals.html`
- Modify: `deals/new-game-deals.html`
- Modify: `deals/steam-deals-under-10.html`
- Modify: `feed.xml`
- Rebuild (ignored): `dist/static/`

**Interfaces:**
- Consumes: `buildDealDataset(base, enriched, config)`, which attaches the Task 1 recommendation string to normalized deals.
- Produces: validated source artifacts and a matching `dist/static/` deployment bundle containing the same factual copy.

- [ ] **Step 1: Rebuild the persisted snapshot, feed, site pages, and deployment bundle**

Run:

```powershell
node scripts/build-alert-snapshot.js
node scripts/generate-rss.js
npm run build
```

Expected: alert snapshot publication succeeds, the RSS generator reports no more than 20 items, the deal collections are generated, and `dist/static/` is rebuilt without errors.

- [ ] **Step 2: Verify only the expected tracked artifacts changed**

Run:

```powershell
git status --short
git diff --check
```

Expected: the ten tracked artifacts listed in this task are modified, with no whitespace errors and no source data changes to `deals.json` or `enriched-deals.json`.

- [ ] **Step 3: Prove retired recommendation language is absent**

Run:

```powershell
$retiredCopy = rg -n "frankly silly|with a hefty|proper cut|game itself is doing the work|price looks sharp" lib/deal-score.js alert-deals.json index.html feed.xml deals dist/static
if ($LASTEXITCODE -eq 0) { $retiredCopy; exit 1 }
if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }
```

Expected: no output and a successful PowerShell step, proving none of the retired phrases remains in source or generated output.

- [ ] **Step 4: Run final regression and site-integrity checks**

Run:

```powershell
npm test
npm run verify
```

Expected: the full test suite passes with zero failures; site verification reports that required source and `dist/static/` assets exist, alert snapshots match, and the build is valid.

- [ ] **Step 5: Review the generated diff and commit it**

Run:

```powershell
git diff --stat
git diff -- alert-deals.json index.html feed.xml deals
git add -- alert-deals.json index.html feed.xml deals/best-pc-game-deals.html deals/co-op-game-deals.html deals/deep-discounts.html deals/hidden-gems.html deals/indie-game-deals.html deals/new-game-deals.html deals/steam-deals-under-10.html
git commit -m "build: refresh factual deal copy"
```

Expected: every rendered recommendation uses the factual middle-dot format and the generated-artifact commit succeeds.
