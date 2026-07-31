# Email setup for thelootradar.com

Two separate jobs share one DNS session:

1. **Receiving** at `contact@thelootradar.com` — MX records published, but
   delivery is **failing**. See "Receiving is broken" below.
2. **Sending** via Resend — domain **verified 2026-07-31**.

## Status

| Piece | State |
| --- | --- |
| Receiving at `contact@` | **Broken** — mail bounces, see below |
| Resend domain verification | Verified 2026-07-31 |
| DKIM / SPF / return-path records | Published and resolving |
| DMARC | Published at `p=none` (monitor only) |
| Gmail send-as for `contact@` | **Not done** — needs an API key, see Phase 4 |
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

## Receiving is broken

Mail to `contact@thelootradar.com` bounces with:

> Your message wasn't delivered to contact@thelootradar.com because the
> address couldn't be found, or is unable to receive mail.

The root `MX` records resolve correctly, so Cloudflare's mail servers are
reachable and are rejecting the recipient. That points at Email Routing
configuration rather than DNS. Two likely causes:

- The destination address has never been **verified**. Cloudflare sends a
  confirmation link that must be clicked; until then it forwards nothing.
  Supporting evidence: a search of the destination mailbox found **no email
  from Cloudflare at all**, so that confirmation was never received.
- There is no **routing rule** for `contact@`. Rules are per-address; a rule
  for some other address, or none at all, leaves `contact@` unroutable.

Diagnosing this needs the Cloudflare dashboard (**Email → Email Routing**) or
an API token with Email Routing read scope. A `Zone:DNS:Edit` token returns
403 on the `email/routing` endpoints by design.

Note when checking a mailbox for proof of delivery: search `in:inbox to:…`,
not `to:…`. A bare `to:` query also matches the Sent folder, so outbound test
messages look like successful deliveries.

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
