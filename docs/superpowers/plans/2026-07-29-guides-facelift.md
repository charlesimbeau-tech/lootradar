# LootRadar Guides Facelift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the guides index and every guide article up to the same visual, editorial, responsive, and accessibility standard as the current LootRadar deal experience.

**Architecture:** Keep every existing URL and the static HTML publishing model. Add one guide-specific stylesheet for the section's visual system and one small progressive-enhancement script that builds article navigation, reading time, section markers, and scroll state from the existing article headings. Rework the guides index as a stronger editorial landing page without changing the underlying article routes.

**Tech Stack:** Static HTML, shared CSS custom properties from `style.css`, vanilla JavaScript, Node.js built-in test runner.

## Global Constraints

- Preserve all existing guide URLs and substantive article copy.
- Use the current charcoal, white, gray, and lime LootRadar palette.
- Do not introduce a new framework or runtime dependency.
- Keep the experience useful when JavaScript is unavailable.
- Never use em dashes in visible copy.
- Keep pricing-source attribution in disclosures rather than promotional copy.

---

### Task 1: Lock the shared guide contract with tests

**Files:**
- Create: `tests/guides-layout.test.js`

**Interfaces:**
- Consumes: the existing guide files under `blog/`, `blog.html`, and the shared Node.js test setup.
- Produces: regression coverage for guide classes, shared assets, navigation, and accessible article structure.

- [ ] **Step 1: Write the failing guide contract test**

```js
test('the guides index uses the editorial landing-page system', () => {
  const source = read('blog.html');
  assert.match(source, /class="guides-index"/);
  assert.match(source, /class="guides-hero"/);
  assert.match(source, /class="guide-feature"/);
  assert.match(source, /href="guides\.css\?v=1"/);
});
```

- [ ] **Step 2: Add the shared article checks**

```js
for (const file of guideFiles) {
  const source = read(file);
  assert.match(source, /<body class="guide-page">/);
  assert.match(source, /href="\.\.\/guides\.css\?v=1"/);
  assert.match(source, /src="\.\.\/lib\/guide-page\.js\?v=1"/);
  assert.match(source, /<article class="blog-content/);
}
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run: `node --test tests/guides-layout.test.js`

Expected: FAIL because the shared guide assets and new markup are not present yet.

### Task 2: Build the reusable article presentation layer

**Files:**
- Create: `guides.css`
- Create: `lib/guide-page.js`
- Modify: `blog/5-pc-game-deals-worth-buying-2026-07-29.html`
- Modify: `blog/best-free-pc-games.html`
- Modify: `blog/cheapest-steam-games.html`
- Modify: `blog/game-price-comparison.html`
- Modify: `blog/how-to-get-free-games.html`
- Modify: `blog/indie-games-under-five.html`
- Modify: `blog/steam-sale-guide.html`

**Interfaces:**
- Consumes: `.blog-content`, its `h1`, `.meta`, `h2` headings, `.cta-box`, `.weekly-pick`, and the global variables in `style.css`.
- Produces: `window.LootRadarGuidePage.init()`, generated `.guide-layout`, `.guide-sidebar`, `.guide-toc`, `.guide-progress`, `.guide-lede`, and section IDs.

- [ ] **Step 1: Add the guide stylesheet**

Create a responsive article shell with a sticky desktop table of contents, a wide editorial header, numbered sections, readable 70-character text measure, polished list cards, highlighted CTAs, refined roundup cards, and a one-column mobile layout.

- [ ] **Step 2: Add progressive article enhancement**

```js
window.LootRadarGuidePage = {
  init() {
    const article = document.querySelector('.blog-content');
    if (!article) return;
    // Add reading time, stable heading IDs, a generated table of contents,
    // current-section state, and a scroll progress indicator.
  }
};
```

- [ ] **Step 3: Wire every article to the shared system**

Each article body receives `class="guide-page"`, a `Skip to guide` link, `../guides.css?v=1`, and `../lib/guide-page.js?v=1`. Existing content, metadata, retailer links, navigation, and footer remain in place.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/guides-layout.test.js`

Expected: PASS.

### Task 3: Rebuild the guides landing page

**Files:**
- Modify: `blog.html`
- Modify: `guides.css`
- Test: `tests/guides-layout.test.js`

**Interfaces:**
- Consumes: all seven existing guide URLs and current LootRadar navigation and footer.
- Produces: `.guides-index`, `.guides-hero`, `.guide-feature`, `.guide-card-grid`, `.guide-card`, and `.guides-principles`.

- [ ] **Step 1: Replace the compact index header with an editorial hero**

The hero states the section promise, links directly to the current roundup and live deals, and explains the three guide categories: smarter buying, free-game clarity, and worthwhile recommendations.

- [ ] **Step 2: Create one featured current roundup**

Use a large text-led feature with publication status, clear summary, and a direct article link. Keep the dated URL unchanged.

- [ ] **Step 3: Rebuild the evergreen guide grid**

Render six consistent cards with category, number, title, short summary, reading-time label, and a clear `Read guide` cue.

- [ ] **Step 4: Add a concise trust strip**

Explain that the guides favor useful purchases, clear conditions, and retailer verification without turning the pricing provider into promotional copy.

- [ ] **Step 5: Run the focused test again**

Run: `node --test tests/guides-layout.test.js`

Expected: PASS.

### Task 4: Verify the full static site

**Files:**
- Modify only if verification exposes a guide-specific defect.

**Interfaces:**
- Consumes: the complete updated site.
- Produces: evidence that tests, the static build, site verification, copy rules, and formatting checks pass.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run the static build**

Run: `npm run build`

Expected: exit code 0 with generated static assets remaining valid.

- [ ] **Step 3: Run site verification**

Run: `npm run verify`

Expected: exit code 0 with no broken internal links or required metadata failures.

- [ ] **Step 4: Check whitespace and copy constraints**

Run: `git diff --check`

Expected: no output.

Run: `rg -n "&mdash;|&#8212;" blog.html blog guides.css lib/guide-page.js tests/guides-layout.test.js`

Expected: no matches in visible guide copy or new assets.
