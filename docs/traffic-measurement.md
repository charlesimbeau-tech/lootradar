# LootRadar traffic measurement

LootRadar uses its existing GoatCounter account for anonymous pageviews, campaign attribution, and a short list of high-value actions. This measurement layer is deliberately narrow: it should answer whether people find useful deals without building user profiles or adding another analytics vendor.

## What may be measured

The browser helper accepts only these events:

- `deal_click`
- `search_used`
- `watchlist_add`
- `watchlist_remove`
- `watchlist_open`
- `watchlist_target_update`
- `recommendation_like`
- `recommendation_skip`
- `auth_request`

An event may contain only the approved product properties plus `campaignSource`, `campaignMedium`, and `campaignName`. Campaign values are accepted only from the fixed source, medium, and campaign patterns in `lib/analytics.js`; arbitrary values are discarded. All values are stripped of control characters and limited to 80 printable characters.

Search events use only these result-count buckets:

- `0`
- `1-9`
- `10-24`
- `25+`

Deal events use only these price buckets:

- `free`
- `under-5`
- `under-10`
- `under-25`
- `25-plus`

## Data that must never be sent

Do not pass any of the following to GoatCounter or place it in an event property:

- Raw search terms
- Email addresses
- Account or user IDs
- Exact watchlist target prices
- Recommendation profiles, genres, likes, or skips as a collection
- Authentication tokens or Supabase session data

The shared helper drops unknown property names, but callers remain responsible for using the approved values. It does not inspect form fields, local storage, Supabase, or the page DOM.

## Campaign links

GoatCounter recognizes campaign parameters on the first page a visitor opens. Use lowercase, stable names and keep campaign values free of usernames, email addresses, or other personal data.

| Channel | Parameters |
| --- | --- |
| Reddit | `utm_source=reddit&utm_medium=community&utm_campaign=<topic>` |
| Discord | `utm_source=discord&utm_medium=community&utm_campaign=<server-or-topic>` |
| Newsletter | `utm_source=newsletter&utm_medium=email&utm_campaign=<issue>` |
| Social | `utm_source=<network>&utm_medium=social&utm_campaign=<post-series>` |

The first complete, approved campaign triplet in a browser session is attached to later high-value actions. A later tagged link does not overwrite it. This makes campaign-to-deal-click comparisons possible without storing a person's search, email address, account ID, or game list.

Approved campaign sources are `bluesky`, `discord`, `facebook`, `instagram`, `newsletter`, `reddit`, `tiktok`, `x`, and `youtube`. Approved media are `community`, `email`, `social`, and `video`. Campaign names must use one of these stable forms:

- `weekly-deals-YYYY-MM-DD`
- `weekly-deal-roundup`
- `site-launch`
- `evergreen-guides`

Example:

```text
https://thelootradar.com/games.html?utm_source=reddit&utm_medium=community&utm_campaign=weekly-deal-roundup
```

Use the same campaign name for links that belong to one release or post series. Change the source and medium to reflect the actual channel. Do not add UTM parameters to CheapShark retailer redirect URLs.

## Reading the numbers

A `deal_click` records an outbound action from LootRadar. It does **not** prove that the visitor bought the game. Purchase conversions require reporting or a postback from the relevant affiliate provider.

Recommended operating metrics:

- Deal click-through rate: sessions with a `deal_click` divided by eligible landing-page sessions
- Search engagement: sessions with `search_used`, split by result bucket
- Watchlist adoption: sessions with `watchlist_add`
- Recommendation feedback: `recommendation_like` and `recommendation_skip`
- Account intent: `auth_request`, without recording the email address

Treat small samples as directional. Campaign and event names should remain stable so results can be compared over time.
