# Homepage Radar Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive text-free LootRadar radar background to the existing homepage hero without changing its semantic content or deal behavior.

**Architecture:** Create a decorative PNG derivative and optimized WebP under `public/`. Apply both through layered CSS backgrounds on `.hero`, with gradients providing contrast and breakpoint-specific positioning; keep `index.html` content and hero-deal generation untouched.

**Tech Stack:** Static HTML/CSS, PNG/WebP assets, Node.js test runner, static-site build scripts.

## Global Constraints

- Keep the existing HTML headline, lede, actions, and featured-deal card unchanged and interactive.
- Do not embed branding words in the background asset.
- Do not change deal selection, sorting, navigation, hero wording, buttons, featured-card markup, or page structure.
- The new background is static and decorative.
- Retain a PNG fallback and deliver an optimized WebP normally.

---

### Task 1: Define the hero-background contract

**Files:**
- Modify: `tests/home-fallback.test.js`

**Interfaces:**
- Consumes: `index.html`, `style.css`, `public/lootradar-radar-hero.webp`, and `public/lootradar-radar-hero.png`.
- Produces: regression coverage for asset delivery, overlays, responsive positioning, and unchanged semantic hero content.

- [ ] Add a test that reads the homepage and stylesheet, asserts both asset filenames, checks layered gradients and mobile `background-position`, and confirms the existing heading, primary action, and `id="heroPick"` remain.
- [ ] Run `node --test tests/home-fallback.test.js`; expect the new test to fail because the assets and CSS references do not exist.

### Task 2: Create and wire the decorative artwork

**Files:**
- Create: `public/lootradar-radar-hero.png`
- Create: `public/lootradar-radar-hero.webp`
- Modify: `style.css:164-189`

**Interfaces:**
- Consumes: the approved LootRadar banner artwork.
- Produces: a text-free 2560×1440 decorative background with CSS WebP delivery and PNG fallback.

- [ ] Edit the approved banner to remove all words while retaining the black/green radar grid, arcs, glow, and gamepad motif.
- [ ] Save the source PNG at 2560×1440 and generate a visually equivalent WebP under 500 KB.
- [ ] Replace the current `.hero` background with a PNG fallback, then override it through `@supports` with WebP; layer directional and vertical gradients above the image.
- [ ] Add tablet and mobile `background-position` and overlay-strength rules at the existing 780px and 560px breakpoints.
- [ ] Run `node --test tests/home-fallback.test.js`; expect all tests to pass.

### Task 3: Build and verify the responsive result

**Files:**
- Modify: generated `dist/` assets through `npm run build`.

**Interfaces:**
- Consumes: the new public assets and CSS.
- Produces: the deployable static bundle and verified desktop/mobile homepage hero.

- [ ] Run `npm test`, `npm run build`, `npm run verify`, and `git diff --check`; expect zero failures.
- [ ] Inspect the homepage at desktop and mobile widths, confirming readable content, a visible radar treatment, unchanged controls, and no horizontal overflow.
- [ ] Commit only the hero assets, stylesheet, test, plan, and generated build artifacts with `git commit -m "design: add radar homepage hero"`.
