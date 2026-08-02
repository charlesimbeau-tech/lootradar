# Factual Deal Reasons Design

## Goal

Replace LootRadar's conversational recommendation language with a compact, factual stat line. Deal reasons should communicate the available evidence without adjectives, jokes, or editorial commentary.

## Display format

Use middle dots to separate independent facts:

`86% positive · 45.9K reviews · 90% off`

The supported variants are:

| Available data | Copy |
| --- | --- |
| Player rating, review count, discount | `{rating}% positive · {reviews} reviews · {discount}% off` |
| Player rating and recorded-low match | `{rating}% positive · {reviews} reviews · Recorded low` |
| Player rating and price above recorded low | `{rating}% positive · {reviews} reviews · ${difference} above recorded low` |
| Critic score without player-rating evidence | `Critic score {score} · Player rating unavailable` |
| Discount without usable rating evidence | `{discount}% off · Rating data unavailable` |
| Neither quality nor discount evidence | `Rating data unavailable` |

The existing compact review-count formatting remains in place. Dollar differences retain two decimal places.

## Scope

The shared recommendation generator will own this wording so cards, featured deal displays, deal and game pages, email digests, and feeds receive the same factual copy. Generated site artifacts and any persisted alert snapshot that contains recommendation text will be refreshed from the source data.

The following language will be removed from generated deal reasons: `frankly silly`, `hefty`, `proper cut`, `the game itself is doing the work`, and `price looks sharp`. The change does not alter deal scores, ranking, filtering, or eligibility.

## Verification

Unit tests will assert each data-dependent variant and ensure the retired editorial phrases cannot return. The normal site build and verification suites will be run, followed by a repository search of generated output for retired language.
