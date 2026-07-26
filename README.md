# LootRadar

LootRadar is a quality-first PC game deal finder. It is designed to surface games worth playing at prices worth paying—not the largest possible pile of cheap listings.

Live site: [thelootradar.com](https://thelootradar.com)

## Original architecture audit

The repository started as a zero-build static site:

- HTML, one shared CSS file, and plain browser JavaScript.
- `app.js` loaded `deals.json`, then fell back to direct CheapShark requests.
- An hourly GitHub Action fetched CheapShark deals, enriched part of the catalog through Steam Store and SteamSpy endpoints, and committed generated JSON to `main`.
- GitHub Pages served the repository behind Cloudflare DNS/CDN.
- Optional passwordless profiles and recommendation feedback used browser Supabase with RLS policies from `db/supabase-recommendations.sql`.
- The homepage ranked by percentage discount by default, inferred genres from title keywords, deduplicated exact titles, and featured free/90%-off games regardless of quality.
- No dedicated Deal Score, historical context, quality gate, content-type exclusion, URL filter state, score tests, or watchlist existed.

The original static runtime served successfully. JavaScript syntax and committed JSON parsed successfully. A local server is required because browser `fetch()` will not load cached JSON reliably from `file://`. Supabase sign-in depends on the configured project and redirect URLs. Live historical-low lookups require network access to CheapShark.

## What changed

- Added a transparent 0–100 Deal Score in `lib/deal-score.js`.
- Added normalized cross-store identifiers, edition-name cleanup, content classification, and spam checks in `lib/deal-normalizer.js`.
- Added owner-editable weights, thresholds, publisher/game exclusions, trusted publishers, and collections in `config/editorial-config.js`.
- Added default quality gates: 70% positive, 100 reviews when available, meaningful price movement, no DLC/non-game content, no bundles, and no lower-confidence Early Access.
- Rebuilt the homepage around curated collections, large readable cards, recommendation reasons, a responsive filter panel, accessible dialogs, empty/error states, and shareable URL filters.
- Added on-demand CheapShark deal lookup for recorded historical low and cheaper-store context. This happens only when a user opens a game.
- Added a device-local watchlist and target prices without requiring an account.
- Removed simulated “deals claimed” social proof.
- Added a public methodology page with exact weights, penalties, limitations, and examples.
- Added Node tests for score ordering, historical-low behavior, eligibility, normalization, content exclusions, filtering, and URL round-trips.
- Added a repeatable test/build pipeline for GitHub Pages and Sites-compatible static deployment.

## Local development

Requirements: Node.js 20+ and Python 3 or any static file server.

```bash
git clone https://github.com/charlesimbeau-tech/lootradar.git
cd lootradar
npm test
python -m http.server 4173
```

Open `http://localhost:4173/`.

To produce a deployment bundle:

```bash
npm run build
```

## Environment variables

No key is required for CheapShark. Copy `.env.example` only when running data-refresh or account-sync workflows.

| Variable | Required | Purpose |
| --- | --- | --- |
| `LR_SUPABASE_URL` | Optional | Supabase project URL for cross-device profile sync |
| `LR_SUPABASE_ANON_KEY` | Optional | Supabase publishable browser key; RLS must remain enabled |
| `MAX_PRICE` | No | Maximum cached CheapShark price, default `70` |
| `PAGE_SIZE` | No | CheapShark page size, maximum/default `60` |
| `PAGES_PER_STORE` | No | Pages requested per active store, default `3` |
| `MAX_NEW_STEAM_LOOKUPS` | No | New Steam metadata lookups per refresh, default `60` |
| `MAX_GAMES` | No | Recommendation umbrella catalog size |
| `MAX_PAGES` | No | SteamSpy catalog pages |

Obtain Supabase values from Project Settings → API in your Supabase dashboard. Do not place service-role keys in this repository or browser code.

## Database setup and migrations

Basic browsing and local watchlists need no database.

For optional account syncing:

1. Create a Supabase project.
2. Run `db/supabase-recommendations.sql` in the Supabase SQL editor.
3. Add `LR_SUPABASE_URL` and `LR_SUPABASE_ANON_KEY` as GitHub repository secrets.
4. Run the “Sync Supabase Config” workflow.
5. Configure `https://thelootradar.com/login.html` as an allowed authentication redirect.

`db/schema.sql` is a forward-looking normalized catalog schema and is not required by the current static site.

## Deal Score formula

```text
Deal Score =
  Game quality       × 35%
  Price value        × 25%
  Discount strength  × 20%
  Review confidence  × 10%
  Player interest    × 10%
  − explicit penalties
```

Each component is 0–100. The final result is clamped to 0–100.

- Quality is 72% user sentiment and 28% critic score when both exist; one available source can stand alone.
- Price value uses distance from a recorded historical low when available. The list view uses CheapShark Deal Rating as a proxy until a user opens the detail view.
- Discount reaches its maximum contribution at 70% off, preventing extreme percentages from dominating.
- Review confidence uses logarithmic review-count scaling up to 50,000 reviews.
- Player interest combines logarithmic review volume (80%) and modest release recency (20%).

Penalties include low review counts, mixed/negative sentiment, no reliable quality data, non-game content, spam-like naming, suspicious list-price ratios, weak discounts, and lower-confidence Early Access.

### Example calculations

- Excellent game, strong discount: 94% positive, 48,000 reviews, 90 critic, 60% off, strong price signal → **91**.
- Mediocre game, huge discount: 58% positive, 220 reviews, 52 critic, 90% off → **56**, including a −12 mixed-review penalty, and excluded from the default feed.
- Excellent game, modest discount: 97% positive, 180,000 reviews, 93 critic, 25% off → **82** because quality and confidence outweigh the modest discount.

## Data sources and limitations

- [CheapShark](https://apidocs.cheapshark.com/) provides USD PC-store prices, deal redirects, Deal Rating, current alternate stores, and recorded historical lows. It is public and keyless, rate limited, and requires CheapShark redirect links. Pricing generally refreshes around hourly, but availability can lag.
- Steam Store app details provides genres, categories, platforms, release date, and cover imagery for matching Steam App IDs.
- SteamSpy provides tags and broad popularity metadata without a key. It is third-party, can be incomplete, and should be treated as approximate.
- Supabase is optional and stores only user-owned recommendation profiles/feedback under RLS.

LootRadar does not currently have a licensed full time-series price database, dependable repeated-bundle history, console price feeds, verified Steam Deck compatibility, publisher batch-release history, or email notification worker. The UI states these gaps rather than presenting inferred data as definite.

## Deployment

GitHub Pages remains the primary repository deployment:

1. Push changes to `main`.
2. Keep GitHub Pages configured to serve the repository root.
3. The scheduled `update-deals.yml` workflow refreshes generated JSON.
4. Keep `CNAME` set to `thelootradar.com` and preserve Cloudflare DNS.

The project also supports:

```bash
npm test
npm run build
```

The build produces `dist/static` plus a Cloudflare Worker-compatible `dist/server/index.js` for Sites hosting.

## Known remaining issues

- Historical lows are loaded on demand; the grid uses a labeled proxy to avoid bulk API calls.
- There is no full price-history time series or typical-sale frequency.
- Console deals and verified Steam Deck status require new licensed sources.
- Email alerts require a scheduled backend and email provider; current targets are checked when the user visits.
- Publisher/developer signals are supported by configuration but metadata coverage is incomplete.
- Existing personalized recommendations use their older profile score and have not yet been migrated to the new Deal Score.
- Cached deal generation should be confirmed with CheapShark for long-term automated-volume compliance.

## Recommended next steps

1. Ask CheapShark to confirm the scheduled caching pattern and preferred request volume.
2. Add a licensed price-history/console source behind a replaceable adapter.
3. Persist normalized games, offers, score snapshots, and watch alerts in Postgres.
4. Add an email notification worker with double opt-in and unsubscribe handling.
5. Ingest verified Steam Deck status from a permitted source.
6. Build a protected owner dashboard over `editorial-config` and flagged-title review queues.
7. Migrate personalized recommendations to blend preference fit with the same transparent Deal Score.
