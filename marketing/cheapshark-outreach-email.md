# CheapShark outreach email

Send from Gmail. `contact@thelootradar.com` receives correctly via Cloudflare
Email Routing, but sending as it needs an SMTP relay that is not set up yet
(see `docs/email-setup.md`), so the signature names the address instead. Their
reply to `contact@` will reach you either way.

Use the contact address listed on cheapshark.com / apidocs.cheapshark.com.

Figures below are from the live workflow and client as of 2026-07-31. If you
change `MAX_REQUESTS`, the cron interval, or the sleep, update the email too.

---

**Subject:** API usage check + question on redirect links — LootRadar (thelootradar.com)

Hi,

I run LootRadar (https://thelootradar.com), a PC game price comparison site
built on your API. Two things I'd rather ask about than assume.

**1. Is our request volume acceptable to you?**

Our refresh runs every three hours, eight times a day, and uses roughly 70
requests per run against a hard ceiling of 90 — about 560 requests a day. We
page `/deals` at 60 per page, three pages per store across 14 stores, with
adaptive paging that stops early when a page yields little. Requests are spaced
350 ms apart and never run concurrently. We identify ourselves as
`LootRadar-Bot/1.2 (contact@thelootradar.com; https://thelootradar.com)`.

We also do a small number of on-demand `/deals?id=` lookups when a visitor
opens a specific game, cached for five minutes per deal with in-flight requests
deduplicated, so a busy page doesn't multiply into repeat calls.

For context on why I'm asking: on 30 July we tested deeper paging (10 pages per
store) and got rate limited around request 50, which cost us 8 of 14 stores for
that run. We rolled straight back to three pages and have been stable since. We
honour `Retry-After`, back off exponentially, and if a wait exceeds 60 seconds
we abandon the run rather than hold a connection open — the next scheduled run
recovers.

If that pattern is heavier than you'd like, tell me what you'd prefer and I'll
change it. Longer intervals, fewer pages, a request ceiling, an off-peak
window — all easy for us to adjust.

**2. Direct retailer affiliate links alongside your data**

Right now every outbound click on our site goes through
`cheapshark.com/redirect?dealID=…`, which I understand to be the expectation
for API users.

We're applying to a retailer's affiliate programme directly. If we're accepted,
would you be OK with us linking straight to that one retailer with our own
tracking, while continuing to use your redirect for every other store? Or would
you rather we source that retailer's pricing from their own product feed and
keep your data out of it entirely?

I'd rather do whichever you prefer than guess and get it wrong. Happy to keep
routing everything through your redirect if that's the answer — I just want it
settled before any money is involved.

We credit CheapShark by name as our pricing source on our terms, privacy, and
methodology pages. If you'd like that more prominent, or worded differently,
tell me and I'll change it.

Thanks for keeping the API open and keyless — it's the reason this site exists.

Charles
LootRadar — https://thelootradar.com
contact@thelootradar.com (forwards to this address)
