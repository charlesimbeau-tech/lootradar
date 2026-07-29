# LootRadar weekly guide task

Prepare this week's LootRadar guide as a draft pull request. Work only inside the LootRadar repository at `G:\codexproject\lootradar`.

## Safety and publishing boundary

- Never push to `main`.
- Never merge a pull request.
- Never bypass a failed check or weaken a validation rule.
- Never edit the user's current checkout or unrelated untracked files.
- If credentials, fresh data, five suitable games, or a required verification step are unavailable, stop and report the exact blocker.
- Do not use em dashes in copy.

## Isolated workspace

1. Confirm the repository is clean enough to read and that GitHub authentication is available.
2. Fetch `origin/main`.
3. Create a new branch named `agent/weekly-guide-YYYY-MM-DD` in a new sibling Git worktree based on the latest `origin/main`.
4. If that branch or worktree already exists, inspect it and stop if reuse could overwrite work.
5. Perform all remaining work in the isolated worktree.

## Freshness and selection

1. Confirm the existing three-hour deal refresh completed successfully.
2. Run `npm run guides:candidates`.
3. Stop if the command reports that the deal snapshot is more than six hours old.
4. Select exactly five eligible games from its candidate output.
5. Do not repeat a game used in any of the four newest weekly issue files.
6. Favor a useful mix of genres, prices, and stores. Use at least three distinct genre families and no more than two picks from one store when the candidate pool permits it.
7. Do not claim that a price is a historical low unless a reliable source directly proves it.
8. Verify factual claims used in the article against first-party store or publisher pages. Keep a short source list for the pull request.

## Write the issue

1. Read the newest file in `content/weekly-guides/` as the format reference.
2. Create `content/weekly-guides/YYYY-MM-DD.json` for the current Monday.
3. Use the exact deal values from the fresh candidate output.
4. Write two clear introductory paragraphs and one original buying recommendation for each game.
5. Each recommendation must explain why the game is worth attention and include a practical caveat about fit, edition, launcher, hardware, play style, or time commitment.
6. Keep CheapShark in the disclosure and redirect URLs, not in promotional copy.
7. Do not invent experience, urgency, scarcity, review evidence, features, or price history.
8. Do not edit generated HTML by hand.

## Generate and verify

1. Run `npm ci`.
2. Run `npm run guides:build`.
3. Run `npm test`.
4. Run `npm run build`.
5. Run `npm run verify`.
6. Run a whitespace and conflict-marker check.
7. Review the diff. It should contain the new structured issue, its generated article, the current feature changes in `blog.html`, and the sitemap update. Do not include unrelated files.

## Open the review

1. Fetch `origin/main` again.
2. If `main` changed, rebase the branch, regenerate, and rerun every check.
3. Commit with `Publish weekly guide for YYYY-MM-DD`.
4. Push only the `agent/weekly-guide-YYYY-MM-DD` branch.
5. Open a draft pull request titled `Weekly guide: 5 PC game deals worth buying, Month D`.
6. In the pull request body, list the five picks, snapshot timestamp, source links, checks run, and any editorial judgment that deserves attention.
7. Return the draft pull request URL and a concise summary. Leave approval, merging, and publication to the site owner.
