# Weekly Picks Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recast the former Guides page and every public link to it as LootRadar's Weekly Picks hub.

**Architecture:** Keep `blog.html` and the weekly issue data model stable. Put dynamic promotion copy in `lib/weekly-guide.js`, public navigation copy in source HTML and page templates, then rebuild generated pages and verify stale guide-library language is absent.

**Tech Stack:** Static HTML, Node.js CommonJS generators, Node test runner, npm build scripts.

## Global Constraints

- The public section name is `Weekly Picks`.
- Keep the stable `blog.html` URL and the current weekly issue URL/data model.
- Do not add archives, layouts, styles, selection logic, or new URLs.
- Use the approved visible and metadata copy from `docs/superpowers/specs/2026-08-02-weekly-picks-hub-design.md` verbatim.

---

### Task 1: Lock the Weekly Picks contract in tests

**Files:**
- Modify: `tests/guides-layout.test.js`
- Modify: `tests/weekly-guide.test.js`

**Interfaces:**
- Consumes: `renderGuideHero(issue)` and `renderGuideFeature(issue)` from `lib/weekly-guide.js`.
- Produces: exact copy assertions and a prohibition on reader-facing `Guides` labels linking to `blog.html`.

- [ ] Add assertions for the approved title, hero, summary, standards, dynamic feature copy, and `Weekly Picks` navigation label.
- [ ] Run `node --test tests/guides-layout.test.js tests/weekly-guide.test.js`; expect failures against the stale copy.
- [ ] Commit the failing contract with `git commit -m "test: define weekly picks hub copy"`.

### Task 2: Update the landing page and shared generators

**Files:**
- Modify: `blog.html`
- Modify: `lib/weekly-guide.js`
- Modify: `scripts/templates/game-page.js`
- Modify: `scripts/templates/deal-landing.js`
- Modify: root public HTML pages that link to `blog.html`

**Interfaces:**
- Consumes: the current issue's `title`, `publishedDate`, and generated relative URL.
- Produces: `renderGuideHero(issue)` with `See this week's picks` and `Browse live deals`; `renderGuideFeature(issue)` with `Latest weekly picks`, the approved description, and `See all five picks`.

- [ ] Replace the landing metadata, structured-data name, hero, summary panel, and selection standards with the approved copy.
- [ ] Change all source navigation/footer labels for `blog.html` from `Guides` to `Weekly Picks`, and game-page action copy to `See weekly picks`.
- [ ] Update generator promotion copy while preserving marker comments and issue-driven title/date/URL values.
- [ ] Run the two focused test files; expect all tests to pass.
- [ ] Commit with `git commit -m "copy: relaunch guides as weekly picks"`.

### Task 3: Rebuild and verify every public artifact

**Files:**
- Modify: generated `blog/`, `deals/`, `games/`, and `dist/` HTML artifacts through `npm run build`.

**Interfaces:**
- Consumes: updated source templates and the current weekly issue JSON.
- Produces: deployable static pages with consistent Weekly Picks naming.

- [ ] Run `npm run build`; expect a successful static-site build.
- [ ] Run `npm test`; expect the complete suite to pass.
- [ ] Run the repository site verification command from `package.json`, then `git diff --check`.
- [ ] Scan reader-facing HTML and generator sources for stale `>Guides<`, `Read buying guides`, `Current roundup`, and `three-minute shortlist`; expect no matches.
- [ ] Commit generated artifacts with `git commit -m "build: refresh weekly picks pages"`.
