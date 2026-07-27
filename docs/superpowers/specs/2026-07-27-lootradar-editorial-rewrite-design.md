# LootRadar Site-Wide Editorial Rewrite Design

**Date:** 2026-07-27
**Status:** Approved concept; implementation pending written-spec approval

## Objective

Rewrite all public-facing LootRadar copy so the site reads like a credible, selective PC-game deal publication rather than a generic deal aggregator or mass-generated SEO site.

The new voice is **sharp editorial**: direct, informed, concise, and occasionally dry. It should confidently recommend worthwhile deals while explaining the evidence behind those recommendations. It must not create authority through hype, fake urgency, unsupported statistics, or unverifiable claims.

## Product Position

LootRadar is a selective PC-game deal desk. It helps players identify good games at worthwhile prices by combining current CheapShark pricing with LootRadar's transparent ranking and filtering policy.

The core promise is:

> Find games worth playing at prices worth noticing.

This is an editorial position, not a guarantee that every listed price is the cheapest price ever, that every game has been personally tested, or that price data updates in real time.

## Chosen Scope

Use a full editorial rewrite without a visual or structural redesign.

The rewrite covers:

- Page titles, metadata descriptions, structured-data descriptions, headings, body copy, labels, calls to action, disclosures, and footer text.
- Browser-generated interface copy in `app.js` and `recommendations.js`, including loading, empty, success, warning, and error states.
- All six existing editorial articles and the blog index.
- About, methodology, games, recommendations, login, privacy, and terms pages.
- Repeated sitewide navigation and promotional copy.

The rewrite does not change:

- Page URLs or navigation architecture.
- Deal-scoring behavior, filtering logic, API behavior, or refresh scheduling.
- AdSense publisher identifiers, affiliate routing, or required disclosures.
- Visual styling except for a small text-fit or accessibility adjustment that becomes necessary because of revised copy.
- Legal meaning or user obligations in the privacy policy and terms.

## Editorial Principles

### 1. Lead with reader value

Copy should answer one of these questions quickly:

- Why is this game or deal worth attention?
- What does this tool help the reader decide?
- Where did the price or recommendation come from?
- What should the reader do next?

Avoid introductions that merely announce the topic or restate the page title.

### 2. Prefer evidence to adjectives

Replace broad praise with a concrete reason. Use available signals such as user rating, review confidence, price, discount, current store, or the site's published scoring components.

Do not use words such as "amazing," "incredible," "ultimate," "unbeatable," "must-have," or "best-ever" unless a precise, supportable context makes the word necessary.

### 3. Vary sentence rhythm naturally

Avoid repeated artificial patterns such as:

- "Every deal. Every store. One page."
- "Save more. Play more. Spend less."
- Three adjacent sentences with identical structure.
- Excessive fragments used to imitate advertising punch.

Short sentences are welcome when they carry information. A dry aside is welcome when it does not obscure the point.

### 4. Make recommendations accountable

LootRadar may say that a deal looks strong, offers good value, or stands out under its published criteria. It must not imply:

- Hands-on testing when none occurred.
- A human editorial team reviewed every listing.
- A game is objectively good for every player.
- A current price is an all-time low unless verified by available data.
- Complete market coverage beyond CheapShark's returned stores.

### 5. Treat urgency carefully

Prices and availability can change, but copy should not manufacture a countdown or pressure a purchase.

Acceptable:

> The listed price may change after you leave LootRadar.

Not acceptable:

> Hurry—this unbelievable deal could disappear any second!

### 6. Keep trust copy plain

Methodology, data-source, advertising, affiliate, privacy, and terms language should be especially literal. These areas should prioritize comprehension over personality.

## Factual Guardrails

### Data timing

- Describe the scheduled snapshot as refreshing every three hours.
- Do not call the data "real time," "instant," or "live" where those words imply continuous synchronization.
- When helpful, use "current snapshot," "latest listed price," or "recently refreshed prices."

### Store coverage

- Do not hard-code "30+ stores," "15+ stores," or another retailer count in evergreen marketing copy.
- Describe coverage as participating or active CheapShark stores.
- If a count is useful in interface copy, derive it from the current dataset rather than prose.

### Data provenance

- Identify CheapShark as the source of store and price listings.
- Identify Steam or SteamSpy only where their enrichment data is actually used.
- Distinguish third-party source data from LootRadar's own scoring and presentation.
- Avoid claiming every seller is authorized unless that exact claim is supportable from the current source policy. Prefer a precise description of CheapShark-listed stores.

### Update and authorship claims

- Remove "updated daily," "updated weekly," and stale year promises unless generated from actual update behavior.
- Remove or qualify "written by real gamers," "our expert team," and similar claims unless ownership can substantiate them.
- Replace the generic authority of "The LootRadar Team" with a neutral LootRadar byline or omit a byline where it adds no value.

### Historical and time-sensitive claims

- Remove stale future-sale dates, expired event references, and unsupported aggregate-value statistics.
- Preserve historical examples only when they remain useful and are safely qualified.
- Use evergreen buying advice when maintaining exact dates would require ongoing editorial upkeep.

## Page-by-Page Treatment

### Homepage: `index.html` and `app.js`

- Replace generic promotional slogans with a concise explanation of the quality-first deal selection.
- Clarify what ranking labels and collections mean.
- Rewrite all card reasons, detail-dialog messages, source notes, watchlist messages, and fallback states in the selected voice.
- Keep button labels action-oriented and literal.
- Ensure no interface message implies a request succeeded before it did.

Target tone example:

> Good games at prices worth noticing. LootRadar filters the current CheapShark snapshot using game quality, price value, and review confidence.

### Games: `games.html`

- Present search and browsing as practical price comparison, not exhaustive market surveillance.
- Rewrite search instructions, featured-deal descriptions, result labels, and failure states.
- Make the relationship between search results and CheapShark clear.

### Recommendations: `recommendations.html` and `recommendations.js`

- Explain preference controls in normal language.
- Replace machine-like pluralization and diagnostic phrases.
- Make local-only guest behavior understandable without sounding technical.
- Describe why a recommendation appears without overstating personalization.

Example:

> Like a few games to give LootRadar a clearer sense of what belongs here.

### About: `about.html`

- Replace startup clichés and unsupported team claims with a concise account of the product's purpose.
- Explain who the site serves, what it does, and what it deliberately filters out.
- Link naturally to methodology for readers who want the scoring details.

### Methodology: `methodology.html`

- Preserve the actual formula and limitations.
- Explain each scoring component in plain English before presenting technical detail.
- State that scores are decision aids, not objective reviews.
- Align all refresh and source language with current implementation.

### Blog index: `blog.html`

- Replace "expert guide" positioning with practical buying guidance.
- Use specific article summaries rather than generic promises.
- Remove stale cadence claims.

### Existing articles: `blog/*.html`

Each article should receive a full sentence-level edit:

- Write a direct opening that frames the reader's decision.
- Remove formulaic hooks such as "Here's a secret" and generic throat-clearing.
- Remove hostility and empty contrarian language.
- Replace padded lists and repeated conclusions with useful criteria, caveats, or examples.
- Correct stale titles and year references where an evergreen title is more accurate.
- Retain SEO topic coverage naturally in headings and opening paragraphs.
- Use a consistent disclosure and source note where relevant.

Covered articles:

- `best-free-pc-games.html`
- `cheapest-steam-games.html`
- `game-price-comparison.html`
- `how-to-get-free-games.html`
- `indie-games-under-five.html`
- `steam-sale-guide.html`

### Login: `login.html`

- Make account benefits and optionality clear.
- Avoid implying that an account is required to browse deals.
- Rewrite authentication feedback in calm, actionable language.

### Privacy and terms: `privacy.html` and `terms.html`

- Correct outdated descriptions of advertising, cookies, account behavior, and data sources.
- Improve headings and sentence clarity without changing legal substance.
- Keep AdSense, affiliate, Supabase, and third-party-service disclosures accurate.
- Do not add marketing language to legal obligations.

### Shared metadata and navigation

- Use consistent product naming: `LootRadar`.
- Write unique, natural meta descriptions for every indexable page.
- Keep titles concise and descriptive.
- Remove keyword-stuffed or exaggerated schema descriptions.
- Ensure repeated navigation labels and footer disclosures match across pages.

## Language Standards

### Preferred patterns

- "Worth a look because..."
- "The latest listed price..."
- "Based on the current snapshot..."
- "Strong player reviews give this deal more confidence."
- "No matching deals right now. Try widening the filters."
- "Price details are temporarily unavailable. The last saved listing is still shown."

### Patterns to remove

- "Ultimate," "amazing," "incredible," and "game-changing."
- "Never pay full price again."
- "We've done the digging."
- "Here are the ones actually worth..."
- "Most of them are garbage."
- "Every deal. Every store. One page."
- "Expert guides" when the expertise is not demonstrated.
- "Real-time" for scheduled snapshot data.
- Artificial scarcity, clickbait questions, and unqualified absolutes.

### Mechanics

- Use contractions where natural.
- Prefer active voice.
- Keep paragraphs short, but do not turn every sentence into a fragment.
- Use sentence case for interface labels and headings unless an existing proper name requires otherwise.
- Use numerals for prices, ratings, counts, and refresh intervals.
- Preserve accessible labels and meaningful link text.

## SEO and Advertising Quality

The rewrite should strengthen, not hollow out, indexable content.

- Each page needs a distinct purpose, title, description, and useful main heading.
- Article copy must offer practical information beyond a list of links or deals.
- Avoid duplicated introductions and conclusions across articles.
- Advertising and affiliate relationships must be visible and plainly disclosed.
- Do not write content primarily to repeat search keywords.
- Do not promise outcomes, savings, or coverage the product cannot guarantee.

These changes improve clarity and perceived editorial quality, but they do not guarantee Google search ranking, AdSense approval, traffic, or advertising revenue.

## Implementation Method

1. Build a complete inventory of visible strings in HTML and JavaScript.
2. Establish shared terminology for snapshots, rankings, stores, prices, watchlists, and recommendations.
3. Rewrite core product pages and shared interface copy first.
4. Rewrite the blog index and every article.
5. Edit legal and trust pages conservatively.
6. Update titles, descriptions, schema, and repeated navigation/footer copy.
7. Search the source tree for prohibited phrases, stale cadence claims, old store counts, and inaccurate real-time language.
8. Run syntax, test, build, and site-verification checks.
9. Inspect every built public page in a browser at desktop and narrow widths.

## Acceptance Criteria

The rewrite is complete when:

- Every public HTML page and user-facing JavaScript string has been reviewed.
- No known robotic slogans, generic authority claims, or unsupported superlatives remain.
- Refresh cadence, source descriptions, advertising disclosures, and account behavior match the implementation.
- No evergreen copy hard-codes a changing store count.
- All six blog articles retain useful topic coverage and read in the same editorial voice.
- Legal meaning remains intact.
- Titles and descriptions are unique, accurate, and natural.
- Existing automated tests pass.
- JavaScript syntax checks pass.
- The static build and site verifier pass.
- The built site has no broken internal navigation or obvious text overflow introduced by the rewrite.

## Risks and Mitigations

- **Risk: useful SEO terms disappear.** Keep topic language in natural titles, headings, and substantive paragraphs rather than repeating it mechanically.
- **Risk: legal wording changes meaning.** Make conservative edits and compare every revised disclosure with the original requirement.
- **Risk: editorial confidence becomes another form of hype.** Require a concrete reason for strong recommendations.
- **Risk: future data changes make copy stale.** Prefer dynamic counts and snapshot language over hard-coded totals and promises.
- **Risk: broad edits break scripts or markup.** Change strings in small groups, run syntax checks, rebuild, and inspect the rendered output.

## Illustrative Before-and-After Direction

These examples define direction; final wording will be fitted to each page.

**Before**

> Never pay full price again. Discover amazing deals from every store.

**After**

> Find games worth playing at prices worth noticing. Compare the latest listings from CheapShark's participating stores.

**Before**

> The strongest mix of game quality, price value, and review confidence.

**After**

> Well-reviewed games with prices that stand out in the current snapshot.

**Before**

> No cheaper current store was returned for this listing.

**After**

> CheapShark didn't return a lower current price for this game.

**Before**

> Like a few games and this section will learn your taste.

**After**

> Like a few games to make these recommendations more relevant.
