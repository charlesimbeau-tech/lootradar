# Email setup for thelootradar.com

Two separate jobs share one DNS session:

1. **Receiving** at `contact@thelootradar.com` — Cloudflare Email Routing.
2. **Sending** as `contact@thelootradar.com` — Resend SMTP via a Gmail alias.

Both worked end to end on 2026-07-31.

## Status

| Piece | State |
| --- | --- |
| Receiving at `contact@` | Working — forwards to `charlesimbeau7@gmail.com` |
| Resend domain verification | Verified 2026-07-31 |
| DKIM / SPF / return-path records | Published and resolving |
| DMARC | Published at `p=none` (monitor only) |
| Gmail send-as for `contact@` | Working from `charles.imbeau@gmail.com`, first delivery confirmed 2026-07-31 |
| `deals@` alert pipeline | Not enabled; `LR_ALERTS_ENABLED` still false |

Records published to the zone on 2026-07-31, all confirmed against the
authoritative nameserver and public resolvers:

```
resend._domainkey.thelootradar.com  TXT  p=MIGfMA0GCSqG…      (218 chars)
send.thelootradar.com               MX   feedback-smtp.us-east-1.amazonses.com  (prio 10)
send.thelootradar.com               TXT  v=spf1 include:amazonses.com ~all
_dmarc.thelootradar.com             TXT  v=DMARC1; p=none;
```

The root `MX`, root SPF, and Google verification records were not modified.
The zone went from 8 to 12 records.

## Where the mail goes

`contact@thelootradar.com` forwards to `charlesimbeau7@gmail.com` via the
Email Routing rule. Sending as `contact@` goes out through Resend SMTP from a
verified Gmail alias. Both directions were confirmed working by the owner on
2026-07-31.

If the forwarding destination ever needs changing, add and verify the new
address under **Destination addresses** first — Cloudflare mails that
confirmation link straight to the address rather than through the forward —
then edit the rule. A rule can carry more than one destination, so a
switchover can run to both for a while.

## Diagnostic notes

Two things cost real time during setup and are worth remembering:

- **Checking a mailbox for proof of delivery:** search `in:inbox to:…`, never a
  bare `to:…`. A bare `to:` query also matches the Sent folder, so your own
  outbound tests read as successful inbound deliveries. This produced a
  confident and completely wrong "receiving works" conclusion.
- **Bounces land in Spam.** Delivery Status Notification failures from
  `Mail Delivery Subsystem` were filtered, so mail appeared to vanish rather
  than visibly fail. Check Spam before assuming a message was never sent.
- **A Resend API key showing "No activity" means Gmail never opened an SMTP
  connection.** Gmail sends its own address-confirmation mail from Google's
  servers; the configured SMTP credentials are exercised only when a real
  message is sent as the alias. An unverified alias appears in the From
  dropdown but silently refuses to send, with no error shown.

Cloudflare's Email Routing configuration cannot be read with a `Zone:DNS:Edit`
token; those endpoints return 403 by design. Use the dashboard.

## Current state, verified 2026-07-31

```
thelootradar.com              MX    route1.mx.cloudflare.net   (28)
thelootradar.com              MX    route2.mx.cloudflare.net   (76)
thelootradar.com              MX    route3.mx.cloudflare.net   (94)
thelootradar.com              TXT   "v=spf1 include:_spf.mx.cloudflare.net ~all"
thelootradar.com              TXT   "google-site-verification=reZ-lVyx..."
send.thelootradar.com               does not exist
resend._domainkey             TXT   does not exist
_dmarc                        TXT   does not exist
```

Receiving is confirmed working: mail addressed to `contact@thelootradar.com`
has been forwarding to the owner's Gmail since at least 2026-02-17.

Re-check any time with:

```bash
nslookup -type=MX thelootradar.com
nslookup -type=TXT thelootradar.com
nslookup -type=TXT resend._domainkey.thelootradar.com
nslookup -type=TXT _dmarc.thelootradar.com
```

## The three rules

1. **Never delete or edit the root `MX` records.** They are Cloudflare Email
   Routing. Removing them silently stops `contact@` from reaching anyone, and
   nothing will bounce visibly to warn you.
2. **Never create a second SPF record on the same name.** The root already has
   one. Two `v=spf1` TXT records on one name invalidates both. If a provider
   asks for SPF on the root, edit the existing record and add an `include:`:
   `v=spf1 include:_spf.mx.cloudflare.net include:_spf.resend.com ~all`
3. **Cloudflare appends the zone to the Name field.** Type `send`, not
   `send.thelootradar.com`, or you create `send.thelootradar.com.thelootradar.com`.
   This is the cause of almost every failed verification.

## Phase 1 — Resend domain

1. resend.com → **Domains → Add Domain** → `thelootradar.com`.
2. Accept the default `send` subdomain for the return path. This keeps Resend's
   MX on `send.` and leaves the root MX (rule 1) alone.
3. Leave the records table open. The DKIM value is unique to the account — copy
   from that screen, never from documentation.

## Phase 2 — Cloudflare records

Dashboard → thelootradar.com → **DNS → Records → Add record**, once per row
Resend lists. Apply rule 3 to every Name field.

The domain was added to Resend on 2026-07-31 (region `us-east-1`, status
*not started*). It asks for exactly these:

| Type | Name | Content | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | the long `p=MIGfMA0GCSqG…` DKIM key | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | as shown |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | — |

Use Resend's **Copy** button for the DKIM value rather than retyping it. It is
several hundred characters and a single wrong character fails verification
with no useful error.

The root SPF record needs **no change**. Resend's SPF lives on `send`, which is
why this coexists with Email Routing.

### Do not enable Receiving in Resend

Resend's domain page has an **Enable Receiving** section, switched off by
default. Leave it off. It asks for an `MX` on `@` pointing at
`inbound-smtp.us-east-1.amazonaws.com`, which is the same root name Cloudflare
Email Routing uses. Adding it breaks `contact@thelootradar.com` and the failure
is silent — mail simply stops arriving.

Resend is for sending only here. Receiving stays with Email Routing.

### Note on automating this

The Cloudflare DNS dashboard does not drive reliably from browser automation:
it holds long-lived connections so the page never reaches idle, screenshots
time out, and its record-type combobox reverts on re-render. Add these four
records by hand.

## Phase 3 — Verify

Resend → **Verify**. Propagation is seconds to minutes on Cloudflare. On
failure, check the record's full name for a doubled domain before anything else.

## Phase 4 — Gmail send-as

1. Resend → **API Keys** → new key, **Sending access**.
2. Gmail → Settings → Accounts → **Send mail as → Add another email address**.
3. Name, then `contact@thelootradar.com`. **Untick "Treat as an alias."**
4. SMTP `smtp.resend.com`, port `587`, TLS. Username `resend`. Password is the
   API key.
5. Gmail mails a code to `contact@`, which forwards to the inbox because
   receiving already works. Paste it.

The API key is a credential — the account owner enters it, not an agent.

## Phase 5 — DMARC

Independent of Resend; safe to add at any point. TXT on `_dmarc`:

```
v=DMARC1; p=none; rua=mailto:contact@thelootradar.com
```

`p=none` monitors only and cannot cause rejection. Move to `quarantine` later,
once the reports show SPF and DKIM passing for everything legitimate.

## Phase 6 — Confirm

Send from the alias to a non-Gmail address and check the headers show
`spf=pass` and `dkim=pass`. Then confirm `contact@` still receives, so nothing
in phases 2 to 5 disturbed the routing.

## Relationship to the alerts pipeline

The README's Resend instructions cover `deals@thelootradar.com` for the
default-off deal email. Phases 1 to 3 here are the same domain verification
that pipeline needs, so doing this once serves both. `LR_ALERTS_ENABLED` should
stay `false` until the rest of the README's checklist is genuinely complete.
