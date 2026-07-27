# LootRadar Brand and Private Accounts Design

**Date:** July 27, 2026
**Status:** Approved design; pending written-spec review
**Product:** LootRadar

## Objective

Bring every visible LootRadar brand asset into the current charcoal-and-mint
design system, then give optional accounts a clear purpose: synchronized
watchlists and preferences, target-price alerts, free-game alerts, and a weekly
quality-first deal digest.

This initiative has two coordinated tracks:

1. A complete brand-asset and legacy-color cleanup.
2. A private account and notification system.

They will ship in stages so the visual cleanup does not depend on unfinished
account infrastructure.

## Current State

### Brand

The redesigned interface uses a charcoal background and mint accent, but several
older blue assets remain:

- `icons/icon.png` is the bright cyan radar icon currently visible in Google
  results.
- `icons/icon.svg` is a detailed cyan radar illustration.
- `icons/logo.svg` uses the old blue accent.
- The blog index, six guides, and price-comparison page still declare the old
  `#30a9de` browser theme color.
- `recommendations.css` retains several blue-era foreground colors.
- The current social preview leans cyan rather than using the new mint identity.

### Accounts

LootRadar already has optional Supabase passwordless authentication. The
recommendation page stores preferences locally and can synchronize its profile
JSON and recommendation feedback for signed-in users.

The present account implementation does not yet provide a complete account
experience:

- Google authentication is not offered.
- The main LootRadar watchlist and target prices remain device-local.
- There is no private account dashboard.
- There are no price-drop, free-game, or weekly digest emails.
- There is no self-service account deletion flow.

## Product Principles

- Browsing and opening deals never requires an account.
- An account must provide concrete utility, not merely a profile badge.
- Accounts are private. LootRadar is not becoming a social network.
- Google is the primary sign-in method; passwordless email remains available.
- Notification subscriptions default to off and require explicit consent.
- Alert coverage and source limitations are stated plainly.
- Affiliate relationships never influence rankings, recommendations, or alerts.
- Guest data is preserved when a visitor creates an account.

## Scope

### Included

- Simplified mint-green LootRadar radar mark.
- Complete favicon, installed-app icon, and social-preview asset family.
- Removal of visible old blue brand remnants.
- Consistent favicon and theme metadata across all public pages.
- Google OAuth through Supabase.
- Existing email magic-link authentication as a fallback.
- A combined sign-in/account-creation experience.
- A private `My account` dashboard.
- Cross-device watchlist and target-price synchronization.
- Cross-device recommendation and filter-preference synchronization.
- Target-price alerts.
- Free-game alerts.
- Weekly five-deal digest.
- Notification history, one-click unsubscribe, and account deletion.
- Row Level Security, duplicate-alert prevention, and failure handling.
- Updated privacy, terms, navigation, analytics, and verification coverage.

### Excluded

- Public profile pages.
- Usernames, public avatars, followers, comments, or public activity.
- Community lists, reviews, achievements, or social feeds.
- Password-based authentication.
- SMS, push, Discord, or mobile-app notifications.
- Claims of complete giveaway coverage.
- Paid account tiers.

## Brand System

### Logo direction

The new mark is a simplified radar designed for recognition at 16–48 pixels:

- Dark charcoal square or circle-compatible background.
- Mint-green rings with substantially thicker strokes than the existing mark.
- One clean sweep line.
- One bright deal-found dot.
- Minimal detail and no glow-heavy cyan effects.
- Generous safe area for maskable installed-app icons.

The logo remains recognizably “radar” without looking like a generic blue target.
It must remain legible in Google results, browser tabs, bookmarks, mobile home
screens, and high-resolution promotional use.

### Asset family

One source vector will produce:

- SVG favicon.
- 16×16, 32×32, and 48×48 PNG favicons.
- `favicon.ico`.
- 180×180 Apple touch icon.
- 192×192 and 512×512 installed-app icons.
- A separate 512×512 maskable icon with safe-zone padding.
- Updated social-preview image using the charcoal, mint, and warm-neutral
  palette.

Existing paths may be retained where useful for cache-safe replacement, but
page heads will reference a versioned favicon family and explicit square PNG
sizes. The web manifest will list purpose-appropriate standard and maskable
icons.

### Color cleanup

- Replace legacy `#30a9de` theme metadata with the current dark theme color.
- Replace old blue recommendation-interface text with current neutral or mint
  tokens while retaining accessible contrast.
- Update both existing SVG logo files so no public path serves an old blue mark.
- Keep cyan only where it has a semantic data-visualization role; it must not
  appear as the primary brand accent.
- Update the social preview to match the new brand rather than the previous
  cyan-heavy direction.

### Search-result rollout

The new favicon will be deployed before another homepage crawl request. Google
may continue showing a cached icon temporarily; the site cannot guarantee the
exact refresh time. The homepage will expose one consistent favicon family so
the next crawl has no conflicting asset choice.

## Authentication Experience

### Entry points

Guests see `Sign in` as a utility navigation action. Authenticated users see
`My account`.

The combined access page contains:

1. `Continue with Google` as the primary action.
2. `Email me a sign-in link` as the fallback.

There is no separate registration form. The first successful Google or email
authentication creates the private account automatically.

### Google authentication

Supabase Auth remains the client integration. Google OAuth is enabled in
Supabase and configured with the production LootRadar origin and callback URLs.
The redirect target passes through the existing same-site redirect guard.

If Google authentication is unavailable or misconfigured, the email-link path
remains functional and the interface explains the fallback without exposing
provider details.

### Private account dashboard

`My account` provides:

- Watched games and target prices.
- Current saved prices and alert state.
- Budget, genre, retailer, discount, and quality preferences.
- Liked and dismissed recommendations.
- Target-price notification controls.
- Free-game notification controls.
- Weekly roundup controls.
- Recent notification history.
- Sign-out control.
- Self-service account deletion.

“Profile” refers only to these private settings and saved items. No account data
is public.

## Data Model

### Existing profile data

The current `lr_profiles` record remains the owner of recommendation and filter
preferences. The stored object will receive a schema version and be normalized
at the application boundary so older saved profiles remain readable.

### Watchlist

`lr_watchlist`

- `user_id`
- `game_key`
- `title`
- `target_price`
- `last_known_price`
- `last_known_store`
- `created_at`
- `updated_at`

The primary key is `(user_id, game_key)`. Titles and current-price fields are
display context, not authoritative catalog identity.

### Notification preferences

`lr_notification_preferences`

- `user_id`
- `target_price_enabled`
- `free_game_enabled`
- `weekly_digest_enabled`
- `timezone`
- `digest_day`
- `unsubscribed_at`
- `updated_at`

All three email types default to disabled. A user must enable each type
explicitly. Weekly digests default to Friday at 10:00 a.m. in the user's saved
time zone. The browser time zone is offered as the initial value, with
`America/New_York` used only when the browser does not provide one.

### Notification delivery history

`lr_alert_deliveries`

- `id`
- `user_id`
- `alert_type`
- `game_key`
- `condition_key`
- `snapshot_id`
- `status`
- `provider_message_id`
- `created_at`
- `delivered_at`

`condition_key` is unique per user and alert condition. It prevents repeat
delivery when the same snapshot is evaluated more than once.

### Processed snapshots

`lr_processed_snapshots`

- `snapshot_id`
- `updated_at`
- `processed_at`
- `qualified_deal_count`
- `status`

This table prevents stale or duplicate deal snapshots from generating alerts.

### Existing feedback

`lr_feedback` continues to store private like/dismiss actions. It remains
account-scoped and is included in deletion.

## Guest-to-Account Merge

Guest browsing remains local-first. At first authentication:

1. Load account-side profile and watchlist data.
2. Read the device-local profile and watchlist.
3. Merge games by stable `game_key`.
4. Preserve the most recently updated preference value.
5. Preserve the more recently edited target price for duplicate games.
6. Union likes and dismissed games, resolving a direct conflict in favor of the
   most recent action.
7. Write the merged result to Supabase.
8. Cache the merged result locally for offline and failure-tolerant use.

No local data is erased until the synchronized write succeeds.

Signed-in changes update the local cache immediately and synchronize in the
background. A failed sync leaves the local feature usable and marks the account
status as `Sync delayed`.

## Notification System

### Scheduler

Supabase scheduled functions run after the expected three-hour LootRadar data
refresh window. Keeping alert evaluation server-side avoids exposing account or
email data to the browser.

The alert function:

1. Fetches the published LootRadar deal snapshot over HTTPS.
2. Validates its timestamp, structure, and minimum safety conditions.
3. Refuses to process an already handled or stale snapshot.
4. Compares qualified listings with enabled user subscriptions.
5. Creates idempotent delivery records.
6. Sends eligible messages through the email provider.
7. Records delivery status and provider identifiers.

If the site refresh fails or the live snapshot has not advanced, the function
sends no “new” alerts.

### Target-price alerts

A target-price alert is eligible when:

- The game is on the user’s watchlist.
- Target-price alerts are enabled.
- A qualified current listing is at or below the target.
- That user has not already received an alert for the same game, qualifying
  price band, and snapshot condition.

The email links to LootRadar’s corresponding search or deal view. The retailer
page remains authoritative for checkout price and availability.

### Free-game alerts

A free-game alert is eligible when:

- Free-game alerts are enabled.
- A qualified current listing has a sale price of zero.
- The listing was not already delivered as the same free offer.

The message states that coverage is limited to free listings included in
LootRadar’s current CheapShark-derived snapshot. LootRadar does not call this a
complete giveaway tracker.

### Weekly digest

Once per week, users with the roundup enabled receive five current deals chosen
from the published quality-qualified snapshot. Selection follows Deal Score and
editorial collection diversity so the email is not five nearly identical deep
discounts.

The digest includes:

- Five games worth attention.
- Current listed price and store.
- Deal Score and a short ranking reason.
- Source and price-change caveat.
- Links back to LootRadar.

### Delivery provider

Resend is the initial transactional email provider. Delivery is isolated behind
a small provider interface so a later provider change does not alter alert
selection logic.

The sending domain must be verified before notification controls are presented
as available in production. Provider API keys and Supabase service credentials
remain server-side.

### Consent and unsubscribe

- Authentication email does not subscribe the user to alerts.
- Each notification category has its own explicit toggle.
- Every alert email contains a signed one-click unsubscribe URL.
- Unsubscribe works without requiring an active login.
- Users can disable one category or all email.
- Weekly digests are never sent to users who have not opted in.
- Unsubscribe tokens are scoped to one account and expire after a documented
  period; using one never exposes account details.

## Privacy and Security

- Supabase Row Level Security restricts profile, watchlist, preference, and
  feedback records to their owner.
- Delivery rows are readable only by their owner and writable by the server-side
  alert service.
- Service-role and Resend credentials never enter public JavaScript or the
  repository.
- GoatCounter receives no email addresses, account IDs, watchlist contents,
  target prices, or private preferences.
- OAuth state and post-login paths use same-site redirect validation.
- Google and email access can be linked to one account through Supabase's
  supported identity-linking flow without replacing or duplicating saved data.
- Account deletion removes authentication access and cascades through private
  profile, watchlist, feedback, notification, and delivery data.
- Account deletion requires a fresh authentication check and an explicit
  confirmation step.
- Privacy and terms pages explain Google authentication, Supabase storage,
  notification delivery, unsubscribe behavior, and data deletion.

## Error Handling

- Google OAuth failure offers the email-link fallback.
- Expired email links return to a recovery state with a new-link action.
- Supabase outage leaves local browsing, filtering, and watchlists usable.
- Failed synchronization retains unsynced local changes and retries later.
- Invalid, incomplete, stale, or implausibly small deal snapshots send no
  alerts.
- Provider failures record a retryable delivery state.
- Retry attempts reuse the same condition key and cannot create duplicate mail.
- Missing provider or domain configuration disables email toggles with an
  accurate explanation.
- Account-deletion failure does not sign the user out or claim deletion
  succeeded.

## Analytics

Existing privacy-safe analytics can add:

- `auth_request` with provider bucket `google` or `email`.
- `account_sync` with success/failure state only.
- `notification_toggle` with category and enabled state.
- `account_delete_request`.

Events must not contain email addresses, user IDs, game IDs, target prices,
watchlist contents, or provider tokens.

## Rollout

### Stage 1: Brand consistency

- Replace all logo assets.
- Add the complete favicon and installed-app asset family.
- Update page-head and manifest references.
- Replace legacy browser theme metadata.
- Remove blue-era recommendation colors.
- Update the social preview.
- Verify all public pages and request a homepage recrawl.

### Stage 2: Private accounts

- Enable Google OAuth with email fallback.
- Add the account dashboard.
- Add database migrations and Row Level Security.
- Synchronize the main watchlist, target prices, preferences, and feedback.
- Implement guest-data merge, failure states, and deletion.
- Update legal and privacy copy.

### Stage 3: Notifications

- Verify the sending domain and configure Resend.
- Add notification preferences and one-click unsubscribe.
- Add snapshot processing and idempotent delivery history.
- Ship target-price, free-game, and weekly digest email.
- Monitor delivery errors without collecting behavioral profiles in analytics.

Each stage is independently deployable and must pass its own acceptance checks.

## Testing

### Brand

- Every public HTML page references the new favicon family.
- No public asset or UI metadata retains the old blue logo colors.
- Manifest icons exist at declared sizes.
- Standard and maskable icons meet their safe-area requirements.
- Favicon remains identifiable at 16, 32, and 48 pixels.
- Social metadata references the updated preview.

### Authentication and synchronization

- A user can link Google and email access to one account through the documented
  identity-linking flow without losing or duplicating saved data.
- Redirects cannot leave LootRadar.
- Guest data merges without silent loss.
- Multi-device updates converge using documented timestamp rules.
- Local features remain usable during a simulated Supabase failure.
- Row Level Security rejects cross-user reads and writes.
- Account deletion removes all private data and authentication access.

### Notifications

- A target crossing sends one alert.
- The same snapshot cannot send the same alert twice.
- A later qualifying condition can send a new alert.
- A failed delivery retries without duplicate records.
- Free-game alerts include only qualified zero-price listings.
- Weekly digests contain five distinct current deals when five are available.
- Disabled or unsubscribed categories send no mail.
- Stale and rejected snapshots send no mail.
- Unsubscribe links work without login and cannot alter another user’s settings.

### Production

- Build and site-verification checks pass.
- All new account pages use canonical and appropriate robots metadata.
- Live favicon, manifest, icons, account page, and callbacks return successfully.
- Production contains no public secrets.
- Search Console receives the updated homepage and sitemap after the brand
  release.

## Acceptance Criteria

- The old cyan icon from the search-result screenshot is no longer served by any
  LootRadar brand-asset path.
- All visible branding uses the current charcoal-and-mint system.
- Google is the primary sign-in option and email magic link remains available.
- Accounts remain optional and private.
- A signed-in user can see the same watchlist, targets, and preferences on
  another device.
- All three requested notification types are available with independent,
  default-off controls.
- Alert processing is idempotent and refuses stale data.
- Users can unsubscribe and delete their account without contacting support.
- Privacy, terms, and analytics accurately match the implemented behavior.
- Existing deal discovery, ranking, advertising, affiliate, RSS, sitemap, and
  guest browsing behavior remains functional.

## Dependencies and External Configuration

- Supabase project access for Google provider configuration, migrations,
  scheduled functions, secrets, and authentication callback URLs.
- Google OAuth client configuration for `thelootradar.com`.
- Resend account and verified sending-domain DNS records.
- A production sender such as `deals@thelootradar.com`.
- Existing GitHub Pages and domain configuration.

If an external dependency is unavailable, the corresponding stage stops with an
accurate user-facing status. Earlier completed stages remain publishable.
