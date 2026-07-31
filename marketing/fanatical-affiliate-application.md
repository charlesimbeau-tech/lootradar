# Fanatical affiliate application — "additional information" field

Draft for the optional free-text field. Numbers are from the snapshot of
2026-07-31 and drift every three hours; re-check before submitting with:

```bash
node -e "const fs=require('fs');const{buildDealDataset}=require('./lib/deal-dataset.js');const{DEFAULT_FILTERS,filterDeals}=require('./lib/deal-filters.js');const c=require('./config/editorial-config.js');const b=JSON.parse(fs.readFileSync('deals.json','utf8'));const e=JSON.parse(fs.readFileSync('enriched-deals.json','utf8'));const v=filterDeals(buildDealDataset(b,e,c),DEFAULT_FILTERS);console.log('qualifying:',v.length,'| Fanatical:',v.filter(d=>d.storeName==='Fanatical').length)"
```

---

**How LootRadar works**

LootRadar is a quality-first PC game price comparison site at thelootradar.com.
It sweeps 14 PC storefronts every three hours, normalises the listings, and
ranks what is left on a published 0–100 Deal Score: game quality 35%, price
value 25%, discount strength 20%, review confidence 10%, and player interest
10%, minus explicit penalties. The full formula, its weights, and its
limitations are public at /methodology.html.

The point of difference is what we throw away. The default view drops anything
below 70% positive player sentiment or under 100 recorded reviews, plus DLC,
soundtracks, season passes, currency packs, demos, and low-confidence Early
Access. Roughly 1,800 listings come in per sweep and about 1,300 survive. A
large discount cannot lift a poorly reviewed game onto the page, which is the
whole proposition: shoppers arrive already filtered for intent and quality.

Alongside the live feed we publish permanent, individually indexed pages: 334
per-game price checks, 8 curated collections (best today, new arrivals, Steam
under $10, co-op, indie, deep discounts, hidden gems), and 8 original buying
guides including a weekly five-deal shortlist. Every one of these renders
server-side with prices, scores, and reasoning present before any JavaScript
runs, so they are fully crawlable and index cleanly.

**Fanatical coverage today**

Fanatical is already in our feed and is one of our strongest performing stores.
In the current snapshot, 115 Fanatical listings clear our quality bar — sixth
of 14 stores by qualifying volume. That includes 100 in our deep-discounts
collection, 36 in indie, and 28 in hidden gems, and Fanatical is the listed
seller on 37 of our 334 permanent game pages. This is existing, organic
placement earned by your pricing, not a proposal.

**The partnership we're looking for**

A standard affiliate/CPA relationship with direct deeplink access. We are
currently ad-funded and hold no retailer affiliate relationships, so outbound
clicks route through our pricing provider's redirect. Direct links would let us
send traffic to Fanatical properly attributed. We are not seeking paid
placement, sponsored ranking, or fixed-fee promotion — our disclosure states
that ranking cannot be bought, and we intend to keep it that way. Commission
does not and will not influence Deal Score, collection eligibility, or order.

**Product focus**

Full PC game keys are our entire focus, particularly discounted back-catalogue
titles with strong review histories, and well-reviewed indie releases. We would
expect Star Deals and deep single-title discounts to perform best for us.

One thing worth flagging honestly: our content rules exclude bundles, DLC, and
non-game products, so our default feed will not surface Build Your Own Bundle
or similar multi-product offers. If you would like those covered, it would need
to be a separate, clearly labelled surface rather than the ranked feed. Happy
to discuss whether that is worth building.

**Media deck / pricing documents**

We do not have a media deck. The product is public and inspectable:

- https://thelootradar.com/ — live ranked feed
- https://thelootradar.com/methodology.html — full scoring formula and limits
- https://thelootradar.com/deals/ — permanent collections
- https://thelootradar.com/games/ — per-game price pages
- https://thelootradar.com/blog.html — editorial guides
- https://thelootradar.com/feed.xml — RSS

**Anything else**

LootRadar is early-stage and we would rather be straight about that than
inflate it. The site launched recently and we are building traffic through
search and editorial rather than paid acquisition. What we can offer now is
genuine catalogue depth, a shopper who has already been filtered for purchase
intent, and clean technical implementation.

We run privacy-preserving analytics (GoatCounter, no user profiling) that
records outbound `deal_click` events by store and price band, so we can report
click volume we send you and reconcile it against your reporting from day one.

We comply with disclosure requirements: an affiliate relationship would be
declared in our footer, terms, and privacy policy across the site before the
first affiliate link goes live.
