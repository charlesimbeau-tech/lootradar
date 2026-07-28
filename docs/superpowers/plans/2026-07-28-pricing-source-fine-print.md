# Pricing Source Fine Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep LootRadar's CheapShark attribution accurate while removing the provider name from prominent acquisition and product copy.

**Architecture:** Treat the provider as an implementation detail in customer-facing copy. Homepage, search, deal-detail, guide, account, and generated collection language will describe “current store listings” or “the latest LootRadar snapshot”; the existing footer and legal disclosures will continue to name CheapShark. Technical API identifiers and redirect URLs remain unchanged.

**Tech Stack:** Static HTML, browser JavaScript, Node.js 20 test runner, existing search-page generator

## Global Constraints

- Keep the pricing-source attribution in the existing footer disclosure and legal pages.
- Do not alter CheapShark API calls, redirect URLs, caching, scoring, or refresh behavior.
- Do not link prominently to CheapShark.
- Keep all claims precise about snapshot coverage, price changes, and retailer authority.

---

### Task 1: Lock the positioning rule with tests

**Files:**
- Modify: `tests/editorial-copy.test.js`

**Interfaces:**
- Consumes: `PUBLIC_HTML`, generated deal collection files
- Produces: a regression test preventing provider-led metadata and visible promotional copy

- [ ] **Step 1: Add a failing positioning test**

Add assertions that public meta descriptions do not name CheapShark, the homepage/search/account copy uses LootRadar language, generated collection text contains the provider name only in fine print, and the provider is not linked from trust-page explanatory copy.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/editorial-copy.test.js`

Expected: FAIL because current metadata, hero copy, search copy, and generated collections feature CheapShark.

### Task 2: Rewrite primary product and trust copy

**Files:**
- Modify: `index.html`
- Modify: `games.html`
- Modify: `account.html`
- Modify: `app.js`
- Modify: `about.html`
- Modify: `methodology.html`
- Modify: `blog/best-free-pc-games.html`
- Modify: `blog/cheapest-steam-games.html`
- Modify: `blog/game-price-comparison.html`
- Modify: `blog/how-to-get-free-games.html`
- Modify: `blog/indie-games-under-five.html`
- Modify: `blog/steam-sale-guide.html`
- Modify: `lib/rss-feed.js`

**Interfaces:**
- Consumes: the existing pricing snapshot and retailer redirects
- Produces: LootRadar-led customer copy with unchanged disclosure accuracy

- [ ] **Step 1: Replace provider-led product language**

Use “latest LootRadar snapshot,” “current store listings,” “pricing source,” and “available comparison data” according to context. Keep warnings that coverage is incomplete and final retailer prices control.

- [ ] **Step 2: Remove the prominent outbound provider link**

Describe third-party source inputs generically in the main About and Methodology copy. Retain the provider name in the footer and legal disclosure.

### Task 3: Rewrite and regenerate permanent deal collections

**Files:**
- Modify: `scripts/build-search-pages.js`
- Regenerate: `deals/index.html`
- Regenerate: `deals/best-pc-game-deals.html`
- Regenerate: `deals/steam-deals-under-10.html`
- Regenerate: `deals/co-op-game-deals.html`
- Regenerate: `deals/indie-game-deals.html`
- Regenerate: `deals/deep-discounts.html`
- Regenerate: `deals/hidden-gems.html`

**Interfaces:**
- Consumes: `PAGE_DEFINITIONS`, `HUB_DEFINITION`
- Produces: permanent collection pages with LootRadar-led metadata and introductions

- [ ] **Step 1: Update generator definitions**

Remove the provider name from descriptions, introductions, and caveats while preserving snapshot limitations.

- [ ] **Step 2: Regenerate pages**

Run: `node scripts/build-search-pages.js`

Expected: all seven collection pages are rebuilt from the current deal snapshot.

### Task 4: Verify and publish

**Files:**
- Verify: all changed source and generated files

**Interfaces:**
- Consumes: the complete static site
- Produces: a tested production commit

- [ ] **Step 1: Run the complete gate**

Run: `npm test`, `npm run build`, `npm run verify`, and `git diff --check`

Expected: all commands exit successfully.

- [ ] **Step 2: Review the final provider mentions**

Run a scoped search for `CheapShark` across public HTML and interface JavaScript. Confirm remaining customer-visible mentions are disclosure/legal fine print while technical identifiers and redirect URLs remain unchanged.

- [ ] **Step 3: Commit and push**

Commit message: `refactor: move pricing source into fine print`

Push the clean `main` branch and verify the custom domain after GitHub Pages builds the commit.
