# Homepage discovery tabs design

## Goal

Make the homepage discovery banner and the filter panel do different jobs. The banner offers a small set of recognizable browsing destinations, while the filter panel narrows the catalog with generic constraints. Remove the manual sort control and choose a predictable ordering from the visitor's current context.

## Homepage states

### Default catalog

With no discovery tab, search query, or non-default filter active, show every qualified deal alphabetically from A to Z. No tab appears selected. This is the homepage's neutral catalog state.

### Filtered catalog

When a visitor searches or changes a generic filter without selecting a discovery tab, order the matching deals by the existing Recommended ranking. Recommended means Deal Score descending, with review volume breaking ties.

### Discovery section

The banner contains these five tabs and no All deals tab:

1. **Best right now**: eligible deals with a Deal Score of at least 75, ordered by Recommended ranking.
2. **Free today**: eligible full games priced exactly $0, ordered by Recommended ranking.
3. **$5 finds**: eligible full games priced above $0 and no more than $5, ordered by Recommended ranking. Free games must not appear here.
4. **New arrivals**: the existing recent-release collection, ordered by release date newest first.
5. **Hidden gems**: the existing hidden-gem collection, ordered by Recommended ranking.

Selecting a discovery tab applies its collection rule. Generic filters and search may further narrow that section, but they do not replace the section's ordering.

## Interaction rules

- Remove the sort dropdown from the homepage.
- Clicking an inactive discovery tab selects it.
- Clicking the active discovery tab deselects it.
- Deselecting a tab returns to alphabetical ordering when no search or generic filters are active; otherwise it returns to Recommended ordering.
- Reset Filters clears the active discovery tab, search query, and generic filters, returning to the alphabetical default catalog.
- The filter drawer remains the only homepage UI for store, genre, maximum price, minimum discount, rating, review count, and content inclusion controls.
- The permanent collection pages remain available through the Deals hub and are not removed by this homepage change.

## State and URLs

The URL continues to encode search, filters, and an active discovery collection so links remain shareable. The automatic ordering is derived from the state and does not need a visible sort parameter. Legacy sort parameters may be normalized away on the next interaction; they must not restore the removed control or override a discovery section's ordering.

The neutral catalog uses no active collection parameter. Loading the homepage without discovery or filter parameters must therefore render the alphabetical catalog and leave every tab unselected.

## Accessibility

Keep the banner as a single `tablist`. Each tab exposes its selected state through `aria-selected`. Because an active tab can be toggled off, the tablist may legitimately have no selected tab. Removing the select also removes its label and keyboard stop; all remaining filters retain their existing labels and keyboard behavior.

## Verification

Automated coverage must prove:

- the sort dropdown is absent;
- the banner contains exactly the five approved discovery tabs;
- no tab is selected in the default state;
- default results sort alphabetically;
- search or generic filters use Recommended ordering without an active tab;
- each discovery tab applies its price or collection boundary and its specified ordering;
- Free today and $5 finds never overlap;
- clicking the active tab clears it;
- Reset Filters restores the neutral alphabetical state;
- URL state remains shareable and legacy sort input cannot override automatic ordering.

The rebuilt homepage must also be checked in a browser at desktop and narrow viewport widths to confirm the single tab row remains usable and the search/filter controls do not leave a layout gap where the sort dropdown was removed.
