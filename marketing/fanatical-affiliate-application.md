# Fanatical affiliate application — "additional information" field

Figures are from the snapshot of 2026-07-31 16:59 UTC and drift every three
hours. Re-check before submitting:

```bash
node -e "const fs=require('fs');const{buildDealDataset}=require('./lib/deal-dataset.js');const{DEFAULT_FILTERS,filterDeals}=require('./lib/deal-filters.js');const c=require('./config/editorial-config.js');const b=JSON.parse(fs.readFileSync('deals.json','utf8'));const e=JSON.parse(fs.readFileSync('enriched-deals.json','utf8'));const v=filterDeals(buildDealDataset(b,e,c),DEFAULT_FILTERS);console.log('qualifying:',v.length,'| Fanatical:',v.filter(d=>d.storeName==='Fanatical').length)"
```

The product-feed request is the part that must survive any further editing. Our
pricing provider confirmed in writing on 2026-07-31 that direct affiliate
linking is acceptable only where the retailer's pricing comes from that
retailer's own feed. Without feed access we cannot attribute traffic at all.

---

LootRadar (thelootradar.com) is a quality-first PC game price comparison site.
We sweep 14 storefronts every three hours and rank what survives on a published
0–100 Deal Score weighing game quality, price value, discount depth and review
confidence. Around 1,835 listings come in per sweep and 1,306 qualify. DLC,
soundtracks, season passes, and anything under 70% positive or with fewer than
100 reviews are dropped before ranking starts, so visitors arrive already
filtered for quality and purchase intent.

Fanatical is already one of our strongest stores: 115 listings currently clear
our bar, 6th of 14 by qualifying volume, average Deal Score 76, and you are the
listed seller on 36 of our 345 permanent game pages. That is organic placement
earned by your pricing, not a proposal.

We are looking for a standard affiliate/CPA relationship plus access to your
product feed. Our pricing currently comes from a third-party aggregator whose
terms require their redirect for anything sourced from their API. They have
confirmed in writing that we may link directly to a retailer if we join that
retailer's programme and take that retailer's pricing from its own feed. The
feed is therefore what makes properly attributed traffic possible. We are not
seeking paid placement or sponsored ranking; our published disclosure says
ranking cannot be bought and we intend to keep that true.

On products: full PC game keys, especially discounted back-catalogue titles
with strong review histories and well-reviewed indie releases. Star Deals
should suit us well. One caveat worth stating upfront — our content rules
exclude bundles and DLC, so Build Your Own Bundle will not appear in our ranked
feed.

No media deck. The site is public and inspectable, including the full scoring
methodology at /methodology.html. We are early-stage, growing through search
and editorial rather than paid acquisition, and would declare any affiliate
relationship across the site before the first affiliate link goes live.
