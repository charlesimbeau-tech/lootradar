# Weekly Guide Publishing Implementation Plan

> **For Codex:** Execute this plan in order. Keep publishing review-first and never push directly to `main`.

**Goal:** Turn LootRadar's weekly guide into a repeatable, validated publishing workflow that Codex can prepare every Monday as a draft pull request.

**Architecture:** Store each weekly issue as structured JSON. A deterministic generator renders the article, updates the Guides page, and adds dated sitemap entries. Tests and site verification enforce freshness, safe links, five unique picks, disclosures, analytics, and brand copy. A scheduled Codex task researches and prepares only the next JSON issue, runs the generator and checks, then opens a draft pull request.

**Tech Stack:** Node.js, static HTML/CSS/JavaScript, Node test runner, GitHub Pages, Codex scheduled tasks.

---

### Task 1: Create the structured weekly issue and renderer

- [x] Add `content/weekly-guides/2026-07-29.json` using the current published guide.
- [x] Add `lib/weekly-guide.js` with issue discovery, validation, escaping, path generation, and article rendering.
- [x] Add `scripts/build-weekly-guide.js` to render all issues and update the current feature on `blog.html`.
- [x] Add generated block markers to `blog.html`.
- [x] Add `guides:build` and `guides:check` package scripts.

### Task 2: Remove hardcoded weekly article references

- [x] Discover weekly issue paths in `scripts/generate-sitemap.js`.
- [x] Discover weekly guide pages in editorial, sitemap, and layout tests.
- [x] Discover weekly pages in `scripts/verify-site.js`.
- [x] Ensure `guides.css` is copied into the production build.

### Task 3: Add strict validation

- [x] Test the seeded issue and rendered article.
- [x] Reject stale snapshots, duplicate picks, unsafe URLs, malformed prices, and missing disclosures.
- [x] Confirm the Guides page points to the newest issue.
- [x] Run `npm test`, `npm run build`, `npm run verify`, and a whitespace check.

### Task 4: Document and schedule the weekly review task

- [x] Add `automation/weekly-guide-prompt.md` with the complete review-first workflow.
- [x] Add `docs/weekly-guide-publishing.md` with operator instructions and failure behavior.
- [x] Create a Monday 10:45 a.m. Eastern Codex task, paused until the supporting code is published.
- [ ] Keep merging and publishing under human approval for the first four runs.
