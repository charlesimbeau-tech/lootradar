# Weekly guide publishing

LootRadar uses a review-first weekly publishing system. Codex prepares a new guide every Monday, but the site owner decides whether it goes live.

## What runs automatically

The existing GitHub workflow refreshes deal data every three hours. The weekly Codex task then:

1. Starts from the newest `main` branch in an isolated Git worktree.
2. Refuses to continue when the price snapshot is more than six hours old.
3. Builds a shortlist of quality-qualified games that did not appear in the previous four issues.
4. Selects five varied deals and verifies claims against first-party sources.
5. Adds one structured issue in `content/weekly-guides/`.
6. Generates the article, Guides feature, and dated sitemap entry.
7. Runs the complete test, build, and verification suite.
8. Opens a draft pull request.

It does not push to `main`, merge, or publish without approval.

## Weekly review

When the task finishes, open its draft pull request and check:

- The five games feel varied and genuinely worthwhile.
- Prices and stores match the snapshot shown in the pull request.
- Each recommendation sounds like LootRadar and includes a useful caveat.
- Factual claims have first-party source links.
- The automated checks passed.

Mark the pull request ready and merge it when the article is satisfactory. GitHub Pages will deploy the merged change through the site's normal publishing path.

Keep this approval step for at least the first four weekly runs. If those runs are consistently accurate, the workflow can be reconsidered, but automatic merging should remain a separate decision.

## Manual commands

- `npm run guides:candidates` lists eligible current candidates and refuses stale data.
- `npm run guides:build` renders articles and updates the Guides page and sitemap.
- `npm run guides:check` confirms generated guide files are current.
- `npm test` runs the full automated test suite.
- `npm run build` creates the production output.
- `npm run verify` checks the production output, metadata, analytics, sitemap, and required assets.

## Failure behavior

The task must stop without opening a pull request when:

- The computer is off or the Codex desktop app is not running.
- GitHub authentication is unavailable.
- The latest data refresh failed or the snapshot is stale.
- Five suitable and varied games are unavailable.
- A source cannot support an article claim.
- Tests, the production build, or verification fail.
- Existing work would be overwritten.

The complete scheduled-task instructions live in `automation/weekly-guide-prompt.md`.
