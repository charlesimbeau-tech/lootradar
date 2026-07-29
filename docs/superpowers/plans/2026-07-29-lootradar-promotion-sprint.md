# LootRadar Promotion Sprint Implementation Plan

> **For Codex:** Execute this plan in the current task. Preserve generated deal data and the user's unrelated `.claude/` directory.

**Goal:** Make LootRadar easier to discover, measure campaign traffic without collecting personal data, and publish a current weekly deal roundup plus a reusable launch pack.

**Architecture:** Keep the site static and compatible with GitHub Pages. Use the existing Search Console URL-prefix property and sitemap, GoatCounter analytics, generated deal snapshot, blog design system, and Supabase-backed account flow. Add only public static assets and privacy-safe attribution.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js tests and build scripts, GoatCounter, Google Search Console, GitHub Pages, Sites mirror.

---

## Task 1: Confirm Google discovery

- [x] Open the `https://thelootradar.com/` URL-prefix property in Google Search Console.
- [x] Confirm ownership is verified.
- [x] Confirm `/sitemap.xml` is submitted successfully.
- [ ] Re-submit the sitemap after the new article is live.
- [ ] Request indexing for the homepage and new roundup.

## Task 2: Add privacy-safe campaign attribution

**Files:**
- Modify: `lib/analytics.js`
- Modify: `tests/analytics.test.js`
- Modify: `docs/traffic-measurement.md`

- [x] Write tests for allow-listed UTM source, medium, and campaign normalization.
- [x] Capture first-touch campaign values without accepting arbitrary personal data.
- [x] Attach those values to supported GoatCounter actions.
- [x] Document stable campaign names and reporting rules.

## Task 3: Publish the first weekly roundup and account CTA

**Files:**
- Create: `blog/5-pc-game-deals-worth-buying-2026-07-29.html`
- Modify: `blog.html`
- Modify: `index.html`
- Modify: `style.css`
- Modify: `scripts/generate-sitemap.js`
- Modify: `tests/sitemap.test.js`
- Modify: `tests/editorial-copy.test.js`

- [x] Build the roundup from the current LootRadar snapshot with five real listings, prices, review context, clear caveats, and tracked retailer links.
- [x] Add the article to the guide index and sitemap.
- [x] Add a concise homepage account CTA that promises only current account features.
- [x] Keep affiliate and data-source disclosures accurate and unobtrusive.

## Task 4: Create the promotional content pack

**Files:**
- Create: `marketing/2026-07-29-weekly-deals-launch-pack.md`

- [x] Provide ready-to-post copy for Discord, X/Bluesky, and short-form video.
- [x] Include channel-specific tagged links.
- [x] Include a community posting note that avoids prohibited link dumping.

## Task 5: Verify and publish

- [x] Run the complete Node test suite.
- [x] Run Supabase function tests.
- [x] Run the static build and site verification.
- [x] Run `git diff --check`.
- [ ] Commit and push only the promotion sprint files.
- [ ] Wait for the exact GitHub Pages commit to become live.
- [ ] Publish the same validated source to the connected Sites project.
- [ ] Verify the live article, campaign tracking assets, sitemap, and homepage CTA.
