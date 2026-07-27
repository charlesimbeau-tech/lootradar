# LootRadar Site-Wide Editorial Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every public-facing LootRadar string in a consistent, sharp editorial voice while correcting stale or unsupported claims and preserving the existing product behavior.

**Architecture:** Keep the existing static HTML, CSS, and JavaScript architecture. Add a focused Node regression test that inventories the public copy and catches known credibility failures, then edit the site in page groups: core positioning, interactive tools, editorial guides, and legal/trust content. Rebuild the existing static bundle and publish the verified source through the project's established hosting flows.

**Tech Stack:** HTML5, browser JavaScript, Node.js 20 built-in test runner, existing static build scripts, CheapShark, GitHub Pages, OpenAI Sites

## Global Constraints

- Use a sharp editorial voice: direct, informed, concise, and occasionally dry.
- Prefer concrete reasons to generic adjectives and superlatives.
- Do not imply hands-on testing, universal market coverage, continuous real-time updates, or an all-time-low price unless the available data supports the claim.
- Describe the scheduled snapshot as refreshing every three hours.
- Do not hard-code changing retailer totals in evergreen marketing copy.
- Identify CheapShark as the source of store and price listings, and distinguish that source data from LootRadar's scoring.
- Remove unsupported team, expertise, update-cadence, and authorship claims.
- Preserve URLs, navigation architecture, deal logic, ad identifiers, affiliate routing, and required legal meaning.
- Preserve useful SEO topic coverage through distinct, natural titles, descriptions, headings, and substantive copy.
- Do not make visual-layout changes except for a small text-fit or accessibility correction required by the new copy.

---

## File Structure

### New file

- `tests/editorial-copy.test.js`: Defines the public-copy inventory and regression checks for stale claims, bot-like phrases, metadata coverage, and unique titles/descriptions.

### Core product and trust

- `index.html`: Homepage positioning, explanatory copy, metadata, section headings, and disclosures.
- `app.js`: Homepage collection summaries, deal reasons, detail-dialog copy, watchlist feedback, loading states, and error states.
- `about.html`: Product purpose, source explanation, limitations, and site identity.
- `methodology.html`: Ranking explanation, source boundaries, refresh cadence, worked examples, and metadata.

### Interactive tools

- `games.html`: Search positioning, instructions, result labels, featured-deal copy, and failure states.
- `recommendations.html`: Recommendation-page positioning, controls, account explanation, and metadata.
- `recommendations.js`: Preference feedback, personalization reasons, authentication states, and errors.
- `login.html`: Optional-account benefits, form instructions, and authentication feedback.

### Editorial content

- `blog.html`: Blog positioning and six article summaries.
- `blog/best-free-pc-games.html`: Evergreen guide to no-cost PC games and giveaways.
- `blog/cheapest-steam-games.html`: Evergreen guide to inexpensive Steam games.
- `blog/game-price-comparison.html`: Accurate guide to comparing PC-game prices.
- `blog/how-to-get-free-games.html`: Evergreen guide to legitimate free-game sources.
- `blog/indie-games-under-five.html`: Price-aware indie recommendations without a false fixed-count promise.
- `blog/steam-sale-guide.html`: Evergreen Steam-sale planning guide without speculative dates.

### Legal, metadata, build, and publishing

- `privacy.html`: Clear advertising, cookie, account, and third-party-service disclosure.
- `terms.html`: Clear price, availability, source, affiliate, and responsibility terms.
- `manifest.json`: Concise product description aligned with the final positioning.
- `sitemap.xml`: Retain current public routes and accurate modification dates when source pages change.
- `scripts/verify-site.js`: Require every public page, every blog article, and editorial regression coverage in the validated build.
- `public/og.png`: One updated social preview that matches the final headline and established visual identity.

---

### Task 1: Add editorial regression coverage

**Files:**
- Create: `tests/editorial-copy.test.js`
- Modify: `scripts/verify-site.js`

**Interfaces:**
- Consumes: UTF-8 HTML and JavaScript source files listed in `PUBLIC_HTML` and `INTERFACE_SCRIPTS`.
- Produces: automated failures for stale cadence claims, unsupported retailer totals, generic authority claims, known bot-like phrases, missing metadata, duplicate titles, and duplicate descriptions.

- [ ] **Step 1: Create the failing editorial-copy test**

Create `tests/editorial-copy.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const PUBLIC_HTML = [
  'index.html',
  'games.html',
  'recommendations.html',
  'login.html',
  'about.html',
  'methodology.html',
  'blog.html',
  'privacy.html',
  'terms.html',
  'blog/best-free-pc-games.html',
  'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html',
  'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html',
  'blog/steam-sale-guide.html'
];

const INTERFACE_SCRIPTS = ['app.js', 'recommendations.js'];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function decodeEntities(value) {
  return value
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function extract(source, expression, file, field) {
  const match = source.match(expression);
  assert.ok(match, `${file} is missing ${field}`);
  return decodeEntities(match[1]);
}

test('public copy avoids stale and unsupported marketing claims', () => {
  const rules = [
    [/\bupdated (?:daily|weekly)\b/i, 'unsupported update cadence'],
    [/\b(?:15|30)\+\s+(?:authorized\s+)?(?:PC game\s+)?(?:retailers|stores)\b/i, 'hard-coded store count'],
    [/\breal[- ]time\b/i, 'real-time claim'],
    [/\bnever pay full price again\b/i, 'absolute savings claim'],
    [/\bexpert guides?\b/i, 'generic expertise claim'],
    [/\bthe LootRadar team\b/i, 'unsupported team claim'],
    [/\bwe(?:’|')ve done the digging\b/i, 'formulaic authority claim'],
    [/\bhere(?:’|')s a secret\b/i, 'formulaic hook'],
    [/\bmost of them are garbage\b/i, 'hostile generalization'],
    [/\bevery deal\. every store\b/i, 'absolute slogan']
  ];

  const violations = [];
  for (const file of PUBLIC_HTML) {
    const source = read(file);
    for (const [pattern, label] of rules) {
      if (pattern.test(source)) violations.push(`${file}: ${label}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('known machine-like interface strings are removed', () => {
  const source = INTERFACE_SCRIPTS.map(read).join('\n');
  const phrases = [
    'The strongest mix of game quality, price value, and review confidence.',
    'Proven games with real review confidence for less than a lunch.',
    'All qualified deals',
    'No cheaper current store was returned for this listing.',
    'Selected \\' + profile.genres.length + \\' genre(s).',
    'Like a few games and this section will learn your taste.',
    'Guest mode (local only)'
  ];
  const violations = phrases.filter(phrase => source.includes(phrase));
  assert.deepEqual(violations, []);
});

test('every public page has unique title and description metadata', () => {
  const titles = new Map();
  const descriptions = new Map();

  for (const file of PUBLIC_HTML) {
    const source = read(file);
    const title = extract(source, /<title>([\s\S]*?)<\/title>/i, file, 'a title');
    const description = extract(
      source,
      /<meta\s+name="description"\s+content="([^"]+)"/i,
      file,
      'a meta description'
    );
    assert.ok(title.length >= 20 && title.length <= 70, `${file} title length is ${title.length}`);
    assert.ok(
      description.length >= 70 && description.length <= 170,
      `${file} description length is ${description.length}`
    );
    assert.equal(titles.has(title), false, `${file} duplicates the title from ${titles.get(title)}`);
    assert.equal(
      descriptions.has(description),
      false,
      `${file} duplicates the description from ${descriptions.get(description)}`
    );
    titles.set(title, file);
    descriptions.set(description, file);
  }
});

test('trust pages state the real refresh cadence and pricing source', () => {
  for (const file of ['about.html', 'methodology.html']) {
    const source = read(file);
    assert.match(source, /every three hours/i, `${file} is missing the refresh cadence`);
    assert.match(source, /CheapShark/i, `${file} is missing the pricing source`);
  }
});
```

- [ ] **Step 2: Run the new test and confirm the current copy fails**

Run:

```powershell
node --test tests/editorial-copy.test.js
```

Expected: FAIL with violations from existing pages, interface strings, missing privacy/terms descriptions, and unsupported claims.

- [ ] **Step 3: Extend the site verifier to inventory every public page**

In `scripts/verify-site.js`, add:

```js
const editorialPages = [
  'index.html', 'games.html', 'recommendations.html', 'login.html',
  'about.html', 'methodology.html', 'blog.html', 'privacy.html', 'terms.html',
  'blog/best-free-pc-games.html', 'blog/cheapest-steam-games.html',
  'blog/game-price-comparison.html', 'blog/how-to-get-free-games.html',
  'blog/indie-games-under-five.html', 'blog/steam-sale-guide.html'
];
```

After the `requiredBuild` checks, add:

```js
for (const file of editorialPages) {
  for (const base of [root, path.join(root, 'dist', 'static')]) {
    const target = path.join(base, file);
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
      failures.push(path.relative(root, target));
    }
  }
}
```

- [ ] **Step 4: Verify the existing test suite still isolates the intended copy failures**

Run:

```powershell
npm test
```

Expected: existing functional tests PASS; only `tests/editorial-copy.test.js` assertions fail.

- [ ] **Step 5: Commit the regression scaffold**

```powershell
git add -- tests/editorial-copy.test.js scripts/verify-site.js
git commit -m "test: add LootRadar editorial copy audit"
```

Expected: one commit containing only the test and verifier inventory.

---

### Task 2: Rewrite the homepage and trust pages

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `about.html`
- Modify: `methodology.html`

**Interfaces:**
- Consumes: existing deal fields, scoring terminology, and CheapShark source behavior.
- Produces: the canonical brand promise and terminology reused by later pages: "current snapshot," "latest listed price," "participating stores," "Deal Score," and "refreshes every three hours."

- [ ] **Step 1: Rewrite homepage metadata and static copy**

Use these canonical homepage elements in `index.html`:

```html
<title>LootRadar — PC game deals worth your attention</title>
<meta name="description" content="Find well-reviewed PC games at worthwhile prices. LootRadar ranks the latest CheapShark listings by quality, value, and review confidence.">
```

Keep the current `<h1>`:

```html
<h1>Games worth playing. Prices worth paying.</h1>
```

Replace supporting copy with:

```html
<p>LootRadar filters the current CheapShark snapshot for well-reviewed games at prices that stand out.</p>
```

Use these section labels where their existing sections appear:

```text
Best deals right now
Great games under $10
Deep discounts worth a look
Smaller games with strong reviews
Browse every qualifying deal
```

Retain the visible source caveat:

```text
Prices come from CheapShark and may change after you leave LootRadar.
```

- [ ] **Step 2: Rewrite generated homepage interface copy**

In `app.js`, replace collection summaries with:

```js
const COLLECTIONS = {
  best: {
    label: 'Best right now',
    title: 'Best deals right now',
    summary: 'Well-reviewed games with prices that stand out in the current snapshot.'
  },
  under10: {
    label: 'Under $10',
    title: 'Great games under $10',
    summary: 'Strong player reviews, credible review volume, and a single-digit price.'
  },
  deepWorthIt: {
    label: 'Deep discounts',
    title: 'Deep discounts worth a look',
    summary: 'Big price cuts that still clear LootRadar’s quality checks.'
  },
  hiddenGems: {
    label: 'Hidden gems',
    title: 'Smaller games with strong reviews',
    summary: 'Less-visible games backed by unusually positive player feedback.'
  },
  all: {
    label: 'All deals',
    title: 'Browse every qualifying deal',
    summary: 'Every current listing that clears the default quality and content filters.'
  }
};
```

Replace the no-lower-price message with:

```js
'CheapShark didn’t return a lower current price for this game.'
```

Replace unavailable-detail copy with:

```js
'Current price details are unavailable. The saved listing is still shown below.'
```

Review every other string literal rendered through `textContent`, `innerHTML`, `setAttribute`, dialog text, watchlist feedback, and error handling. Apply the approved terminology and retain dynamic values.

- [ ] **Step 3: Rewrite the About page around purpose, operation, and limits**

Use this content structure in `about.html`:

```html
<h1>About LootRadar</h1>
<p>LootRadar is built for players who want a good game, not merely the largest percentage badge on the page.</p>

<h2>What LootRadar does</h2>
<p>CheapShark supplies the store and price listings. LootRadar normalizes those listings, removes obvious add-ons and low-confidence entries, then ranks the remaining deals using game quality, price value, discount strength, review confidence, and player interest.</p>

<h2>How current are the prices?</h2>
<p>The published snapshot refreshes every three hours. A store can change a price between refreshes, so confirm the final amount on the retailer’s page before buying.</p>

<h2>What LootRadar does not promise</h2>
<p>A high Deal Score is a useful signal, not a universal verdict. LootRadar does not test every game, cover every PC retailer, or guarantee that a listed price is an all-time low.</p>

<h2>Why the filters are strict</h2>
<p>Cheap does not automatically mean worthwhile. The default view favors complete games with credible player feedback and filters out obvious DLC, soundtracks, virtual currency, and low-confidence listings.</p>
```

End with a natural link to `methodology.html` for the exact scoring formula.

- [ ] **Step 4: Rewrite Methodology from plain-English explanation to formula**

Keep the implemented formula, weights, penalties, and worked calculations unchanged. Replace promotional framing with:

```html
<h1>A good price only matters when the game is worth playing.</h1>
<p>LootRadar’s Deal Score is a ranking aid. It combines signals from the current listing and available game metadata; it is not a review score or a promise that every player will enjoy the game.</p>
```

Introduce the source section with:

```html
<h2>Where the data comes from</h2>
<p>CheapShark supplies current store and price listings. Steam and SteamSpy metadata may add review, popularity, and game-detail context. LootRadar applies its own eligibility rules and Deal Score to those inputs.</p>
<p>The site publishes a refreshed snapshot every three hours. Prices, availability, and metadata can change between snapshots.</p>
```

Use these explanation headings:

```text
Quality
Price value
Discount strength
Review confidence
Player interest
Penalties and exclusions
```

- [ ] **Step 5: Run focused syntax and copy checks**

Run:

```powershell
node --check app.js
node --test tests/editorial-copy.test.js
```

Expected: `node --check` PASS. Editorial tests may still fail only for untouched interactive, blog, and legal pages; no failure should name `index.html`, `about.html`, `methodology.html`, or a replaced `app.js` phrase.

- [ ] **Step 6: Commit the core positioning**

```powershell
git add -- index.html app.js about.html methodology.html
git commit -m "copy: sharpen LootRadar core positioning"
```

Expected: one commit covering homepage and trust-page copy only.

---

### Task 3: Rewrite games, recommendations, and account copy

**Files:**
- Modify: `games.html`
- Modify: `recommendations.html`
- Modify: `recommendations.js`
- Modify: `login.html`

**Interfaces:**
- Consumes: canonical terminology from Task 2.
- Produces: clear search, recommendation, preference, guest-mode, sign-in, loading, empty, and error messages.

- [ ] **Step 1: Rewrite game-search positioning and states**

Use this metadata in `games.html`:

```html
<title>Compare PC game prices — LootRadar</title>
<meta name="description" content="Search current PC game listings from CheapShark’s participating stores, compare available prices, and open the retailer offering the deal.">
```

Use this page introduction:

```html
<h1>Compare prices before you buy</h1>
<p>Search for a PC game to see the current listings CheapShark returned from participating stores.</p>
```

Use these states:

```text
Enter at least 2 characters to search.
No matching games found. Try the full title or a shorter search.
Search is unavailable right now. Please try again in a moment.
Featured deals are unavailable right now. You can still search by title.
The latest price details could not be loaded.
```

Review every rendered inline-script string and remove "best price," "lowest price," or exhaustive-coverage language when the data cannot prove it.

- [ ] **Step 2: Rewrite recommendation-page positioning**

Use this metadata and opening in `recommendations.html`:

```html
<title>Personalized PC game deals — LootRadar</title>
<meta name="description" content="Set your budget, genres, and store preferences to narrow LootRadar’s current PC game deals to the listings most relevant to you.">
<h1>Deals tuned to what you play</h1>
<p>Choose a budget, a few genres, and the stores you trust. LootRadar will narrow the current snapshot without hiding why each game appears.</p>
```

Replace the initial authentication label with:

```html
<div id="authStatus">Saved on this device</div>
```

Clarify that sign-in sync is optional and browsing works without an account.

- [ ] **Step 3: Rewrite recommendation interface strings**

In `recommendations.js`, use:

```js
hint.textContent = profile.genres.length === 1
  ? '1 genre selected.'
  : `${profile.genres.length} genres selected.`;
```

Use this empty-like-history reason:

```js
reason.textContent = 'Like a few games to make these recommendations more relevant.';
```

Use this local-state label:

```js
statusEl.textContent = 'Saved on this device';
```

Use this signed-in label:

```js
statusEl.textContent = `Synced as ${user.email}`;
```

Use these errors:

```text
Recommendations could not be loaded. Please refresh the page.
Your preferences could not be saved. The previous settings are still in place.
Sign-in failed. Check your email and password, then try again.
```

Review every visible string in the file, preserving dynamic titles, genre names, prices, and counts.

- [ ] **Step 4: Rewrite login benefits and feedback**

Use this metadata and opening in `login.html`:

```html
<title>Sign in to sync LootRadar preferences</title>
<meta name="description" content="Sign in to sync your LootRadar deal preferences across devices, or keep browsing and saving preferences locally without an account.">
<h1>Keep your preferences in sync</h1>
<p>An account is optional. Sign in when you want the same budgets, genres, and store choices on another device.</p>
```

Use literal form feedback:

```text
Signing in…
Signed in. Returning to your recommendations…
We could not sign you in. Check your details and try again.
Account creation is unavailable right now.
```

- [ ] **Step 5: Run syntax and targeted copy checks**

Run:

```powershell
node --check recommendations.js
node --test tests/editorial-copy.test.js
```

Expected: syntax PASS. Editorial failures should now be limited to untouched blog and legal pages.

- [ ] **Step 6: Commit the interactive-tool copy**

```powershell
git add -- games.html recommendations.html recommendations.js login.html
git commit -m "copy: humanize LootRadar interactive tools"
```

Expected: one commit for games, recommendations, and account language.

---

### Task 4: Rewrite the blog index and evergreen service guides

**Files:**
- Modify: `blog.html`
- Modify: `blog/game-price-comparison.html`
- Modify: `blog/how-to-get-free-games.html`
- Modify: `blog/steam-sale-guide.html`

**Interfaces:**
- Consumes: canonical source, cadence, coverage, and recommendation terminology from Tasks 2–3.
- Produces: evergreen guides that explain decisions and legitimate sources without promising exhaustive or continuously current coverage.

- [ ] **Step 1: Rewrite blog positioning and card summaries**

Use this metadata and opening in `blog.html`:

```html
<title>PC game buying guides — LootRadar</title>
<meta name="description" content="Practical guides to PC game sales, free-game offers, price comparison, and inexpensive games—written to help you decide what is worth buying.">
<h1>PC game buying guides</h1>
<p>Practical advice for comparing prices, judging discounts, and finding more to play without collecting a backlog by accident.</p>
```

Use these article titles:

```text
How to get free PC games legally
How to shop a Steam sale without overspending
Excellent indie games that often cost less than $5
Free PC games worth knowing about
Inexpensive Steam games worth playing
How to compare PC game prices across stores
```

Write each card summary in 18–30 words and state the reader decision it supports.

- [ ] **Step 2: Rewrite the price-comparison guide**

Use:

```html
<title>How to compare PC game prices across stores — LootRadar</title>
<meta name="description" content="Learn why PC game prices differ by store, what to check before buying a key, and how to compare current CheapShark listings without false certainty.">
<h1>How to compare PC game prices across stores</h1>
```

Structure the article as:

```text
Why the same game has different prices
Check the edition before comparing
Confirm region and activation details
Treat percentage discounts as context, not proof
Compare participating stores
Confirm the final price with the retailer
How LootRadar fits into the process
```

State that LootRadar uses a snapshot refreshed every three hours and that the retailer page is authoritative at checkout.

- [ ] **Step 3: Rewrite the legitimate free-games guide**

Use:

```html
<title>How to get free PC games legally — LootRadar</title>
<meta name="description" content="A practical guide to legitimate PC game giveaways, permanently free games, subscriptions, and the checks that help you avoid misleading offers.">
<h1>How to get free PC games legally</h1>
```

Keep useful sections for Epic, Steam, GOG, Prime Gaming, itch.io, publisher promotions, and free-to-play games. Qualify subscription offers as included with a paid membership rather than "free." Remove stale prices, unverified giveaway-value totals, and promises that LootRadar captures every offer.

- [ ] **Step 4: Rewrite the Steam-sale guide as evergreen advice**

Use:

```html
<title>How to shop a Steam sale without overspending — LootRadar</title>
<meta name="description" content="Plan a Steam sale budget, compare current key-store prices, check editions, and judge discounts without buying games solely because the percentage looks large.">
<h1>How to shop a Steam sale without overspending</h1>
```

Structure the article as:

```text
Start with the games you already want
Set a budget before the sale
Check price history when it is available
Compare the same edition across stores
Leave room for a better future price
Remember that a discount is not a review
Use LootRadar as a shortlist, not a stopwatch
```

Remove speculative 2026 dates and change any specific recurring-sale months to qualified historical patterns.

- [ ] **Step 5: Validate metadata and forbidden-phrase progress**

Run:

```powershell
node --test tests/editorial-copy.test.js
```

Expected: only remaining failures identify the three untouched recommendation articles or missing legal metadata.

- [ ] **Step 6: Commit the service-guide rewrite**

```powershell
git add -- blog.html blog/game-price-comparison.html blog/how-to-get-free-games.html blog/steam-sale-guide.html
git commit -m "copy: rebuild LootRadar buying guides"
```

Expected: one commit for the blog index and three evergreen service guides.

---

### Task 5: Rewrite the game-recommendation articles

**Files:**
- Modify: `blog/best-free-pc-games.html`
- Modify: `blog/cheapest-steam-games.html`
- Modify: `blog/indie-games-under-five.html`

**Interfaces:**
- Consumes: the approved sharp-editorial standards and current article subject matter.
- Produces: useful recommendation pieces that state selection criteria, avoid fixed update promises, and qualify changing prices.

- [ ] **Step 1: Rewrite the free-games article**

Use:

```html
<title>Free PC games worth knowing about — LootRadar</title>
<meta name="description" content="A selective guide to strong free-to-play PC games and recurring giveaway sources, with practical notes on cost, ownership, and changing availability.">
<h1>Free PC games worth knowing about</h1>
```

Open with:

```html
<p>“Free” can mean a permanent game, a limited-time giveaway, or a store built around optional purchases. Those are different bargains. This guide separates them and highlights the games that offer a substantial experience without an upfront price.</p>
```

Keep free-to-play and giveaway sources in separate sections. Remove "right now," weekly-update promises, exhaustive tracking claims, and unsupported historical-value totals.

- [ ] **Step 2: Rewrite the inexpensive-Steam article**

Use:

```html
<title>Inexpensive Steam games worth playing — LootRadar</title>
<meta name="description" content="Well-regarded Steam games that regularly reach low prices, plus practical checks for editions, key stores, review confidence, and changing sale prices.">
<h1>Inexpensive Steam games worth playing</h1>
```

Open with:

```html
<p>Steam has no shortage of cheap games. The useful question is which ones still feel generous after the price badge stops being interesting.</p>
```

Keep price bands as typical sale-price context, not guaranteed current prices. Remove the stale 2025 title, hostile language, "we did the digging," and absolute cheapest-price claims.

- [ ] **Step 3: Rewrite the indie article without a fixed-count promise**

Use:

```html
<title>Excellent indie games that often cost less than $5 — LootRadar</title>
<meta name="description" content="Distinctive indie PC games that frequently reach single-digit sale prices, selected for strong ideas, player response, and lasting value.">
<h1>Excellent indie games that often cost less than $5</h1>
```

Open with:

```html
<p>A small price does not require a small game. These indie releases are worth watching because they pair a clear creative idea with strong player response and frequent sale prices near $5.</p>
```

Qualify every listed amount as a typical or observed sale price unless the page reads current deal data dynamically. Remove the fixed count, 2026 label, "amazing," "need to play," and store-count claims.

- [ ] **Step 4: Normalize article metadata and bylines**

For all three files:

- Use the same visible date convention: `Reviewed July 2026`.
- Replace `By the LootRadar Team` with `LootRadar guide`.
- Match `<title>`, Open Graph title, X title, JSON-LD headline, visible `<h1>`, and blog-index link text.
- Write distinct Open Graph, X, and JSON-LD descriptions derived from each page's unique meta description.
- Keep article links descriptive and update cross-links to the new evergreen titles.

- [ ] **Step 5: Run the editorial regression test**

Run:

```powershell
node --test tests/editorial-copy.test.js
```

Expected: stale-claim and interface-string assertions PASS. Metadata failures may remain only for privacy or terms until Task 6.

- [ ] **Step 6: Commit the recommendation-article rewrite**

```powershell
git add -- blog/best-free-pc-games.html blog/cheapest-steam-games.html blog/indie-games-under-five.html
git commit -m "copy: refine LootRadar game recommendations"
```

Expected: one commit for the remaining three articles.

---

### Task 6: Align legal copy, metadata, and repeated site language

**Files:**
- Modify: `privacy.html`
- Modify: `terms.html`
- Modify: `manifest.json`
- Modify: `sitemap.xml`
- Modify: any HTML or JavaScript file still identified by the inventory review

**Interfaces:**
- Consumes: current AdSense, affiliate, Supabase, CheapShark, and browser-storage behavior.
- Produces: clear legal/trust language, complete unique metadata, consistent repeated navigation/footer text, and a clean editorial regression run.

- [ ] **Step 1: Add clear legal metadata**

Use:

```html
<!-- privacy.html -->
<title>Privacy policy — LootRadar</title>
<meta name="description" content="Learn how LootRadar handles local preferences, optional account data, analytics, advertising cookies, and information shared with third-party services.">

<!-- terms.html -->
<title>Terms of use — LootRadar</title>
<meta name="description" content="Read the terms governing LootRadar’s price listings, third-party store links, optional accounts, advertising, affiliate relationships, and site use.">
```

- [ ] **Step 2: Rewrite the privacy policy for clarity without changing obligations**

Organize `privacy.html` under:

```text
Information stored on your device
Optional account information
Advertising and cookies
Third-party services
External store links
Data choices
Policy updates
Contact
```

State these implemented behaviors plainly:

- Guest preferences and watchlist data may stay in browser storage.
- Supabase handles optional account authentication and synced preference data.
- Google AdSense may use cookies or similar technologies subject to consent and Google policy.
- CheapShark supplies price/store information and retailer redirect links.
- External retailers apply their own privacy policies.

Do not promise a consent flow that the deployed site does not implement.

- [ ] **Step 3: Rewrite the terms for clarity without weakening safeguards**

Organize `terms.html` under:

```text
Using LootRadar
Prices and availability
Deal Scores and recommendations
Third-party stores and links
Advertising and affiliate relationships
Accounts and saved preferences
Acceptable use
Changes to these terms
Contact
```

State that:

- Price listings come from third parties and can change between the three-hour snapshots.
- The retailer's checkout page controls the final price, region, edition, and availability.
- Deal Scores and recommendations are informational, not guarantees or personal financial advice.
- LootRadar is not the seller and does not process game purchases.

- [ ] **Step 4: Align manifest and sitemap**

Set `manifest.json` description to:

```json
"description": "PC game deals ranked by quality, value, and review confidence"
```

Update `<lastmod>` in `sitemap.xml` to `2026-07-27` for every public page changed in this rewrite. Do not add or remove routes.

- [ ] **Step 5: Perform the complete visible-string inventory**

Run:

```powershell
rg -n -i "ultimate|amazing|incredible|expert guides?|never pay|real.?time|updated (daily|weekly)|(?:15|30)\\+.*(?:stores|retailers)|we.ve done|here.s a secret|garbage|every deal\\. every store|The LootRadar Team" --glob "*.html" --glob "*.js" --glob "!dist/**"
```

Expected: no user-facing matches. Functional title-normalization or content-filtering regex matches in `lib/` and `recommendations.js` may remain when they do not render copy.

Then inventory rendered JavaScript strings:

```powershell
rg -n "textContent|innerHTML|insertAdjacentHTML|setAttribute\\(" app.js recommendations.js games.html login.html
```

Review every match against the approved specification and revise any remaining synthetic, vague, inaccurate, or inconsistent string.

- [ ] **Step 6: Run all source-level checks**

Run:

```powershell
node --check app.js
node --check recommendations.js
npm test
git diff --check
```

Expected: all tests PASS, both syntax checks exit 0, and `git diff --check` prints no errors.

- [ ] **Step 7: Commit the legal and consistency pass**

```powershell
git add -- privacy.html terms.html manifest.json sitemap.xml index.html games.html recommendations.html login.html about.html methodology.html blog.html blog app.js recommendations.js
git commit -m "copy: align LootRadar trust and sitewide language"
```

Expected: one commit containing legal, metadata, and any final sitewide consistency edits.

---

### Task 7: Build, inspect, create the social preview, and publish

**Files:**
- Modify: `public/og.png`
- Verify: all modified source files
- Generate: `dist/static/**`

**Interfaces:**
- Consumes: the completed source rewrite and existing static build configuration.
- Produces: a validated deployment bundle, a matching social preview, the updated production branch, and a hosted deployment.

- [ ] **Step 1: Run the complete pre-build verification**

Run:

```powershell
npm test
node --check app.js
node --check recommendations.js
git diff --check
```

Expected: all tests PASS; syntax and whitespace checks exit 0.

- [ ] **Step 2: Build the static deployment**

Run:

```powershell
npm run build
```

Expected: exit 0 with `Built 24 root assets and 5 public directories.`

- [ ] **Step 3: Run the built-site verifier**

Run:

```powershell
npm run verify
```

Expected: exit 0 and a verification message covering all required source assets, build assets, JSON data, AdSense wiring, CheapShark wiring, and editorial pages.

- [ ] **Step 4: Freeze and generate one social-preview image**

Use this single image-generation brief:

```text
Create a polished 1200×630 social preview for LootRadar, a selective PC-game deal desk. Use the site's existing dark navy background, electric cyan/teal accents, subtle radar-grid motif, and crisp premium editorial typography. Include exactly this text: "LootRadar" and "Games worth playing. Prices worth paying." Add a restrained visual suggestion of a radar sweep finding a single worthwhile game deal among noisy price tags. Keep the composition readable at thumbnail size, avoid retailer logos, controller clichés, fake screenshots, discount explosions, and extra text.
```

Inspect the returned image. It is valid only if both requested text strings are spelled exactly, no extra text appears, and the existing brand palette is recognizable. Retry once only if unusable; otherwise retain the prior `public/og.png` rather than ship an incorrect card.

- [ ] **Step 5: Rebuild and reverify after the social asset**

Run:

```powershell
npm run build
npm run verify
```

Expected: both commands exit 0 and `dist/static/public/og.png` is non-empty.

- [ ] **Step 6: Review the final source change set**

Run:

```powershell
git status --short
git diff --stat HEAD~5
git diff --check
```

Expected: only planned editorial, test, verification, metadata, sitemap, and social-preview changes appear; no whitespace errors.

- [ ] **Step 7: Commit the verified final asset**

```powershell
git add -- public/og.png
git commit -m "design: refresh LootRadar social preview"
```

If the previous social asset was retained unchanged, skip this commit.

- [ ] **Step 8: Synchronize and publish the production branch**

Run:

```powershell
git fetch origin
git status --short --branch
git pull --rebase origin main
git push origin main
```

Expected: clean `main` synchronized with `origin/main`, with all rewrite commits present remotely.

- [ ] **Step 9: Publish the verified build through Sites**

Use the existing `.openai/hosting.json` configuration and the Sites hosting workflow. Deploy the exact verified `dist` output and wait for the deployment to report success.

- [ ] **Step 10: Verify the public result**

Check the production homepage and a representative route from each content group:

```text
/
/games.html
/recommendations.html
/about.html
/methodology.html
/blog.html
/blog/steam-sale-guide.html
/privacy.html
/terms.html
```

Expected: HTTP 200, correct final titles/descriptions in page source, no old bot-like slogans, and the published homepage contains `Games worth playing. Prices worth paying.`
