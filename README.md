# Clothing Finder

A clothing discovery workspace with Legit and Reps views, title/image inputs, researched resale listings, seller evidence, and a proxy cost calculator.

[Roadmap](ROADMAP.md) · [Research and additional marketplaces](docs/RESEARCH.md) · [CI](https://github.com/anjaneys/clothing-finder/actions/workflows/ci.yml)

**Status: early local prototype.** Live adapters need provider credentials and account testing. Research snapshots and source handoffs are labelled separately from live API results. The roadmap documents planned work, not capabilities already delivered.

## Run

Node.js 22.13 or later. Clone the repository, enter the project folder, and install the locked dependencies:

```powershell
git clone https://github.com/anjaneys/clothing-finder.git
cd clothing-finder
npm ci
npm run dev
```

Open http://localhost:5173. If npm's Windows shim fails, use `node scripts/run-framework.mjs dev`.

```powershell
npm run typecheck
npm test
npm run test:api  # requires the development server
npm run build
npm start
```

## Included

- Title search and marketplace handoffs: Grailed, Depop, eBay, Vinted, Facebook Marketplace, Etsy, Poshmark, Mercari Japan, Rakuma and Yahoo! Auctions.
- Reps searches: Taobao, 1688 and indexed Weidian pages, with additional Chinese keywords for the Rick Owens example. Results are candidates; site location does not establish authenticity.
- Four real Rick Owens research snapshots, with prices, seller evidence and source links. Two close degrade matches and two solid-black alternatives. These are not guaranteed live inventory.
- Marketplace, waist and USD budget filters; match, USD price and trust sorting. Unknown/non-USD prices are hidden by the USD budget filter and sorted after priced USD results.
- Image upload and optional image-to-search-term identification. Images remain in browser memory until Identify image is used, which sends the photo to the configured OpenAI provider. No permanent image storage.
- Manual listings scoped to query and lane, retained through tab changes for this session. Refreshing resets them. Apply observed seller counts and a price benchmark in listing details to update the card and trust sorting.
- Proxy calculator with domestic/international shipping, proxy fees, payment fees and estimated taxes/duties. Supply quotes in one currency and a conversion rate. Missing costs remain unknown; currency changes clear old quotes.

## Optional connections

Copy `.env.example` to `.env`, fill in your own optional credentials, then restart. `.env` is ignored by Git; no credentials are included in the repository or exposed to the browser. In PowerShell: `Copy-Item .env.example .env` (only when you do not already have a configured `.env`).

| Variable | Enables | Setup |
| --- | --- | --- |
| `EBAY_ACCESS_TOKEN` | Official Browse keyword results, prices and feedback | [eBay Buy APIs](https://www.developer.ebay.com/develop/api/buy). OAuth application token with `https://api.ebay.com/oauth/api_scope`. Token refresh is manual. |
| `BRAVE_SEARCH_API_KEY` | Indexed marketplace discovery | [Brave Search API](https://api-dashboard.search.brave.com/). Indexed pages may be stale; no seller metrics or prices are inferred from snippets. |
| `OPENAI_API_KEY` | Suggested clothing search terms from images | [Image inputs](https://developers.openai.com/api/docs/guides/images-vision). Requires API access and billing. |
| `OPENAI_VISION_MODEL` | Image-capable model | Default `gpt-4.1-mini`; configurable for your account. |

Without keys, the app reports setup status, returns researched references for the Rick Owens bias/bootcut query family, and opens marketplace searches for other items. Arbitrary image identification needs the vision key. Real provider-account requests remain untested because credentials were not supplied.

Private or login-only inventory is not crawled. Login, CAPTCHA and regional restrictions are not bypassed. Direct marketplace APIs require permission and connector-specific work. This is a local starter; public deployment with paid keys requires authentication, rate limits and production operations.

## Seller scoring

The score is an explainable heuristic, not a probability or authentication service. It uses observed sales, listings, feedback quality and volume, account age and verified photo evidence. Missing fields are null; zero is a confirmed count. Fewer than two evidence categories generally withholds a score.

A price below 40% of a median supported by at least three comparable items lowers trust. Combined with zero sales and zero active listings, trust is capped at 25. Comparables must match item, condition, currency and authenticity category. Initial mixed variants are intentionally not treated as a valid automatic benchmark. User benchmarks are labelled as user input.

eBay feedback score is a volume proxy, not a sales count; rating percentages and score may cover different periods. A high score, marketplace badge, seller claim or proxy route does not establish authenticity. Japanese resale is in Legit.

## Files

- `components/finder.tsx`: interface, details, filters, session entries and costs.
- `lib/reference-listings.ts`: research snapshots.
- `lib/marketplaces.ts`: source links and routes.
- `lib/search-providers.ts`: eBay and Brave adapters.
- `lib/scoring.ts`: trust and landed cost.
- `lib/listing-identity.ts`: deduplication preserving Chinese listing IDs.
- `app/api/`: search, identification and connection status.
- `tests/`: scoring, costs, deduplication and API checks.

React/TypeScript on Vinext/Vite with Cloudflare-compatible output. The source repository is public; the application runs locally. No public application deployment is configured.

GitHub Actions installs from the lockfile, checks TypeScript, tests scoring/cost/deduplication, builds the app, and smoke-tests the API without paid provider credentials.

## Research

Observed September 13, 2026 UTC / September 12 New York. Snapshots may be cached; recheck original pages.

- [Grailed degrade W34](https://www.grailed.com/listings/101913374-rick-owens-rick-owen-bias-bootcut-jeans): $500 + $14.99 observed US shipping; missing cattail, seller metrics unavailable.
- [Poshmark mainline degrade W36](https://poshmark.com/listing/Rick-Owens-Main-Label-Bias-Bootcut-Black-Pearl-Degrade-W36-686072552326c8bc1bcbda58): $700 + $6.49 observed shipping; vincentlopez596, sales/reviews unknown.
- [eBay solid-black wax W29](https://www.ebay.com/itm/227343221934): $700 or best offer; archivevaultnyc, 215 sold, feedback score 303, 100% positive, joined March 2007; shipping varies.
- [Depop solid-black wax W29](https://www.depop.com/products/kuromifan99-black-wax-rick-owens-drkshdw-623c/): $700; kuromifan99, 46 sold, 19-feedback indicator. Could overlap the eBay item; identity unverified.
- [HBX exact-model reference, sold out](https://hbx.com/men/brands/rick-owens-drkshdw/degraded-bias-bootcut-jeans-4-black-pearl-degrade): provisional match to DRKSHDW DU02C5352-SBEDE, Black Pearl Degrade.
- [Grailed terms](https://www.grailed.com/about/terms), [Vinted terms](https://www.vinted.com/terms-and-conditions), [Meta automated collection](https://about.fb.com/news/2021/04/how-we-combat-scraping/), [Depop partner API](https://partnerapi.depop.com/api-docs/), [Buyee fees](https://bc.help.buyee.jp/en/fee/).
