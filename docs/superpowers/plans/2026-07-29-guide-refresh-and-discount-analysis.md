# Guide Refresh and Discount Analysis Implementation Plan

> **For LootRadar:** Execute this plan inline with tests after each implementation layer.

**Goal:** Turn three evergreen guides into current, evidence-backed resources and publish an original-data article that tests whether 90% discounts reliably indicate good PC game deals.

**Architecture:** Add a small pure analysis module for cohort statistics, then use one build script to read LootRadar's normalized deal snapshot, refresh marked modules inside three existing guides, and generate the new analysis article. Keep the site static, preserve the current guide design system, and integrate the generator into both local builds and the scheduled data workflow.

**Tech Stack:** Node.js 24, CommonJS, static HTML and CSS, Node test runner, GitHub Actions.

**Constraints:** Use only current LootRadar snapshot data, qualify every time-sensitive statement, avoid historical-low claims, avoid em dashes, preserve the current URLs, and keep pricing-provider attribution in disclosure copy.

---

### Task 1: Add the analysis model

**Files:**
- Create: `lib/discount-analysis.js`
- Create: `tests/discount-analysis.test.js`

**Steps:**
1. Write failing tests for eligible listing selection, 90% cohort metrics, comparison metrics, medians, and empty data.
2. Implement the pure analysis functions.
3. Run the focused test file.

### Task 2: Build guide deal modules and the original-data article

**Files:**
- Create: `scripts/build-guide-deal-modules.js`
- Create: `tests/guide-deal-modules.test.js`
- Modify: `blog/game-price-comparison.html`
- Modify: `blog/best-free-pc-games.html`
- Modify: `blog/steam-sale-guide.html`
- Create: `blog/are-90-percent-discounts-good.html`
- Modify: `guides.css`

**Steps:**
1. Add failing tests for generated modules, article metadata, current snapshot language, accessible card markup, and prohibited claims.
2. Add stable marker blocks to the existing guides.
3. Implement the generator and article template.
4. Add responsive styling for live cards and data callouts.
5. Run the focused generator tests.

### Task 3: Integrate publishing and discovery

**Files:**
- Modify: `blog.html`
- Modify: `package.json`
- Modify: `.github/workflows/update-deals.yml`
- Modify: `scripts/generate-sitemap.js`
- Modify: `scripts/verify-site.js`
- Modify: `tests/guides-layout.test.js`
- Modify: `tests/editorial-copy.test.js`
- Modify: `tests/workflow-refresh.test.js`

**Steps:**
1. Add the new analysis article to the guide index.
2. Run the guide module builder before sitemap and static builds.
3. Repair and extend the scheduled workflow so generated guides are refreshed and staged.
4. Add the article to sitemap and verification inventories.
5. Expand regression tests for the new guide and valid workflow structure.

### Task 4: Verify the complete static site

**Steps:**
1. Run all Node tests.
2. Run the production build.
3. Run the site verifier.
4. Run `git diff --check`.
5. Review the generated article and all modified guide modules for evidence, readability, mobile layout, and prohibited em dashes.
