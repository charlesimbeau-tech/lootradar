# Weekly Picks Hub Design

## Goal

Make the former Guides page accurately describe what LootRadar still publishes: one recurring five-game weekly shortlist. Remove copy that implies a broader library of buying guides, free-game guides, price-comparison articles, or other evergreen editorial coverage.

## Product identity

The public name of this section is **Weekly Picks**. Replace **Guides** with **Weekly Picks** in public navigation, footers, cross-page links, page metadata, and other reader-facing labels that refer to this section.

`blog.html` remains the stable hub URL. It presents the newest weekly issue and leaves room for future weekly issues without claiming that an archive already exists.

## Hub copy

The hero uses this copy:

- Eyebrow: `Five games worth a look each week`
- Heading: `LootRadar’s weekly PC game picks.`
- Introduction: `Every week, we choose five PC game deals with strong player reviews and prices worth checking. Each pick includes why it made the list and what to verify before buying.`
- Primary action: `See this week’s picks`
- Secondary action: `Browse live deals`

The summary panel is titled `What you’ll find here` and contains:

1. `Five current PC game deals.`
2. `The rating, review count, price, and Deal Score behind each choice.`
3. `Any edition, launcher, or store detail worth checking first.`

The generated feature block uses:

- Status: `Latest weekly picks · {issue date}`
- Issue heading: the current weekly issue title from structured issue data
- Description: `Five well-reviewed games with current prices that stand out. See the evidence, the price, and the main thing to check before buying.`
- Link: `See all five picks`

The standards section is titled `How we choose the five` and contains:

1. Heading: `Game quality comes first.`
   Body: `Player ratings and review counts have to support the recommendation.`
2. Heading: `The current price has to be meaningful.`
   Body: `A large discount alone is not enough to earn a place.`
3. Heading: `Purchase details stay visible.`
   Body: `Edition, launcher, region, and store details belong in the decision.`

## Metadata

Use the following page metadata:

- Document title: `Weekly PC game picks | LootRadar`
- Meta description: `Five well-reviewed PC game deals selected each week using current prices, player ratings, review counts, and LootRadar Deal Scores.`
- Social title: `LootRadar weekly PC game picks`
- Social description: `Five current PC game deals, with the price and review evidence behind every pick.`
- Structured-data name: `LootRadar Weekly Picks`

Remove obsolete broad-guide keywords and descriptions. Metadata must not claim coverage of giveaways, general price-comparison advice, free-game guides, or an evergreen guide library.

## Generated content and source ownership

The weekly issue data remains the source of truth for the featured issue title, publication date, URL, and issue contents. The weekly build continues replacing the marked hero and feature regions in `blog.html` with the latest issue.

Static copy surrounding those generated regions must describe the weekly-picks product only. A rebuild must preserve the approved labels and must not restore the removed general-guide language.

Public pages and generation templates that link to `blog.html` must use `Weekly Picks` or an equivalent action such as `See weekly picks`; they must not continue labeling that destination `Guides` or `Read buying guides`.

## Scope boundaries

This change does not alter weekly issue selection, issue contents, deal ranking, refresh schedules, URLs, page layout, styling, or account behavior. It does not create an archive interface or fabricate additional weekly issues.

## Verification

Tests and generated-output checks must prove that:

- `Weekly Picks` replaces `Guides` in reader-facing navigation, footers, and cross-page links to `blog.html`.
- `blog.html` contains the approved hero, summary, feature, standards, metadata, and structured-data copy.
- The latest issue title, date, and URL still come from the structured weekly issue data after a rebuild.
- Removed claims about broad guide coverage do not return in source or deployment output.
- The full test suite and site verifier pass.
- Source output and `dist/static` output match after the build.
