# Clothing Finder

A clothing discovery workspace with Legit and Reps views, title/image inputs, researched resale listings, seller evidence, and a proxy cost calculator.

[Cloud database setup](docs/DATABASE.md) · [Plan for thousands of results](docs/RETRIEVAL-SCALE.md) · [Roadmap](ROADMAP.md) · [GAT resale](docs/GAT-RESALE.md) · [GAT suppliers](docs/GAT-SOURCING.md) · [More marketplaces](docs/RESEARCH.md) · [CI](https://github.com/anjaneys/clothing-finder/actions/workflows/ci.yml)

**Status: public Poshmark retrieval, resumable search, and cloud-ready Library implemented.** Poshmark works without an API key; eBay/Brave still need credentials and account testing. The Supabase integration is ready for your hosted project; no cloud database is connected yet. Research snapshots and source handoffs are labelled separately from live API results. The roadmap documents planned work, not capabilities already delivered.

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

- **Library & data**: unsaved session preview plus private Supabase storage once connected. Browse saved searches, asking-price distributions, marketplace coverage, seller-evidence bands, availability, and per-item history. Saved tables/history/export are paginated; chart totals cover all matching rows.
- Hosted PostgreSQL schema with user ownership/RLS, immutable dated observations, idempotent batched saves, automatic saving while signed in, and export/delete controls. No local database fallback or permanent reference-photo storage. See [cloud setup](docs/DATABASE.md).
- Title search and marketplace handoffs: Grailed, Depop, eBay, Vinted, Facebook Marketplace, Etsy, Poshmark, Mercari Japan, Rakuma and Yahoo! Auctions.
- Default **Maison Margiela GAT demo** in Legit: search current public Poshmark pages, then choose **Load more** or **Show all matching pages**. Results append and deduplicate without a six-listing cap. Six dated examples from Poshmark, Depop, Mercari US, Grailed and eBay remain in a collapsed research section.
- Reps keeps seven dated product/catalog links, with filters for single-pair shops, replica leads, bulk factories and seller location. Each card shows available prices, order minimums, size/material differences, shipping routes and inspectable evidence. Independent brands are labelled separately from replicas.
- Reps discovery covers Taobao, 1688, Weidian, MADEN, NOVESTA Japan, Made-in-China, Bona Shoes and Huangxuan. Chinese marketplace queries and English direct-shop/factory queries use GAT terms for this demo. Existing Rick Owens jeans expansion remains supported.
- An explicit **Load dated jeans examples** button loads four real Rick Owens research snapshots, with prices, seller evidence and source links. Two close degrade matches and two solid-black alternatives. These are not guaranteed live inventory.
- Marketplace, item-size and USD budget filters apply to retrieved listings and researched resale examples; match, USD price and trust sorting are available. The supplier directory has its own purchase/location filters and does not mix bulk quotes into individual deal ranking. Unknown/non-USD prices are hidden by the USD budget filter and sorted after priced USD results.
- Image upload and optional image-to-search-term identification. Images remain in browser memory until you choose **Identify image** (OpenAI) or **Search photo on eBay** (eBay Browse). Both require their corresponding credentials. No permanent image storage or app caching of photo searches.
- Editable target fields and deterministic title-based matching distinguish model words, full style codes, conflicting variants and missing information. These fields refine ranking; the search title controls provider retrieval. No claim of validated visual similarity or exact-item accuracy.
- Per-source status reports include pages, request counts, skipped records, partial coverage, rate limits, cancellation and setup failures. Healthy results survive another source failing.
- Evidence history keeps observation method, raw/normalized values, timestamps and expiry. Corrections append your observation while retaining imported facts.
- Manual listings scoped to query and lane, retained through tab changes for this session. Unsaved entries reset on refresh; cloud-saved observations remain in the Library. Apply observed seller counts and a price benchmark in listing details to update the card and trust sorting.
- Proxy calculator with domestic/international shipping, proxy fees, payment fees and estimated taxes/duties. Supply quotes in one currency and a conversion rate. Missing costs remain unknown; currency changes clear old quotes.

## Optional connections

Copy `.env.example` to `.env`, fill in your own optional credentials, then restart. `.env` is ignored by Git; no private provider credentials are included in the repository or exposed to the browser. The Supabase project URL and publishable key are intentionally public; user JWTs and RLS protect the records. In PowerShell: `Copy-Item .env.example .env` (only when you do not already have a configured `.env`).

| Variable                                | Enables                                                                     | Setup                                                                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | Official Browse keyword/photo results, asking prices and available feedback | [Application authorization](https://developer.ebay.com/develop/guides/sell/authorization). Server acquires an application token and re-mints before expiry; one recovery after a rejected token. Confirm your production Buy API access first. |
| `EBAY_ACCESS_TOKEN`                     | Legacy alternative to client credentials                                    | Used only when the client pair is absent. You must replace expired bearer tokens manually.                                                                                                                                                     |
| `BRAVE_SEARCH_API_KEY`                  | Indexed marketplace discovery                                               | [Brave Search API](https://api-dashboard.search.brave.com/). Indexed pages may be stale; no seller metrics or prices are inferred from snippets.                                                                                               |
| `OPENAI_API_KEY`                        | Suggested clothing search terms from images                                 | [Image inputs](https://developers.openai.com/api/docs/guides/images-vision). Requires API access and billing.                                                                                                                                  |
| `OPENAI_VISION_MODEL`                   | Image-capable model                                                         | Default `gpt-4.1-mini`; configurable for your account.                                                                                                                                                                                         |

Without keys, Legit title searches retrieve public Poshmark listings; eBay and Brave report their setup states. Set `POSHMARK_PUBLIC_SEARCH=false` to disable public fetching. Reps indexed discovery still needs Brave. The dated GAT directory and marketplace links work; dated jeans examples load only when explicitly requested. The official GAT reference photo is display-only; upload your own image to identify or search it. Arbitrary image identification needs the vision key. Real provider-account requests remain untested because credentials were not supplied.

Private or login-only inventory is not crawled. Login, CAPTCHA and regional restrictions are not bypassed. Direct marketplace APIs require permission and connector-specific work. This is a local starter; public deployment with paid keys requires authentication, rate limits and production operations.

## Provider limits and retention

Each batch has a 20-second deadline per source including queue time. eBay/Brave allow at most three pages and six search HTTP attempts per batch; Poshmark allows one public page and two attempts. **Show all matching pages** performs serial batches, preserving the last accepted cursor and existing cards if stopped or interrupted. New targets invalidate earlier requests. This removes the application result cap, not provider coverage limits. eBay allows two concurrent searches per process, Brave one. eBay token minting is shared with a separate 10-second/two-attempt budget, so reported search requests exclude token requests. A failed response may retry once; 429 honors reset windows and long cooldowns. Three transient/schema failures pause eBay or Brave for 30 seconds. These process-local protections are not a public-service quota system.

Provider result caching defaults off. Only after verifying your agreement permits storage, set the matching `EBAY_STORAGE_ALLOWED` or `BRAVE_STORAGE_ALLOWED` to `true` and its `*_CACHE_TTL_SECONDS` to 1–300. Cache entries preserve original observation times; uploaded-photo searches are never cached. Unsaved results live in the browser session. Once the hosted Library is connected and signed in, eligible listing observations and target data can persist in Supabase; eBay/Brave cloud saves honor the same storage-allowed flags. Live API and public-page observations get a 15-minute recheck time. This is a UI freshness heuristic, not a provider stock guarantee or retention license.

Poshmark's public HTML includes listing data, canonical product URLs and an opaque next-page cursor. The adapter parses JSON without executing scripts, rejects redirects and oversized/malformed responses, and only requests the fixed public search route. GAT searches naming Margiela use the broad model query, then rank variants against the submitted target. Search-card prices, sizes, seller usernames and availability are observed; missing seller sales/reviews and shipping remain unknown. On September 14, 2026, the broad GAT query reported 199 primary matches before broader recommendations; counts change. The adapter stops at the observed recommendation boundary and reports limited coverage, not universal inventory completion. Public HTML/schema changes or access restrictions may interrupt retrieval. See [implementation notes](docs/PAGINATION.md).

Brave uses separate English and Japanese marketplace groups for Legit. Reps allocates its three-page budget across Chinese marketplaces, English direct shops and English factory product pages. Returned URLs must structurally identify a listing, preserving supported shop variant IDs. Category pages such as XuFan's catalog remain research links instead of indexed offers. Providers can still return irrelevant or stale listings.

## Seller scoring

The score is an explainable heuristic, not a probability or authentication service. It uses observed sales, listings, feedback quality and volume, account age and verified photo evidence. Missing fields are null; zero is a confirmed count. Fewer than two evidence categories generally withholds a score.

A price below 40% of a median supported by at least three comparable items lowers trust. Combined with zero sales and zero active listings, trust is capped at 25. Comparables must match item, condition, currency and authenticity category. Initial mixed variants are intentionally not treated as a valid automatic benchmark. User benchmarks are labelled as user input.

eBay net feedback score is separate from seller review and sales counts, may be negative, and is not used as review volume. Browse does not supply seller lifetime sales, active inventory, seller review count or account age, so those remain unknown. Rating percentages and scores may cover different periods. A high score, marketplace badge, seller claim or proxy route does not establish authenticity. Japanese resale is in Legit.

## Files

- `components/finder.tsx`: interface, details, filters, session entries and costs.
- `components/cloud-library.tsx`, `lib/library/`, `app/api/library/`: cloud/session data browser, auth, normalized saves and analytics.
- `supabase/migrations/`: hosted PostgreSQL schema, RLS and transactional functions. Database records are not committed.
- `lib/reference-listings.ts`: research snapshots.
- `components/sourcing-directory.tsx`, `lib/sourcing-leads.ts`: GAT supplier directory, source evidence, purchase filters and MOQ goods estimates.
- `lib/marketplaces.ts`: source links and routes.
- `lib/search-providers.ts`: server-only provider configuration.
- `lib/discovery/`: typed adapters, bounded transport, eBay token lifecycle and search runs.
- `lib/item-intent.ts`, `lib/evidence.ts`: item matching and observation history.
- `lib/scoring.ts`: trust and landed cost.
- `lib/listing-identity.ts`: deduplication preserving Chinese listing IDs.
- `app/api/`: search, identification and connection status.
- `tests/`: scoring, costs, deduplication and API checks.

React/TypeScript on Vinext/Vite with Cloudflare-compatible output. The source repository is public; the application runs locally. No public application deployment is configured.

GitHub Actions installs from the lockfile, checks TypeScript, runs 94 provider, identity, evidence, scoring, sourcing, pagination and PostgreSQL/library tests, builds the app, and smoke-tests the API with external providers disabled. Public-page contract tests use synthetic fixtures; the local Poshmark route was also verified with actual requests.

## Research

Observed September 13, 2026 UTC / September 12 New York. Snapshots may be cached; recheck original pages.

- [Grailed degrade W34](https://www.grailed.com/listings/101913374-rick-owens-rick-owen-bias-bootcut-jeans): $500 + $14.99 observed US shipping; missing cattail, seller metrics unavailable.
- [Poshmark mainline degrade W36](https://poshmark.com/listing/Rick-Owens-Main-Label-Bias-Bootcut-Black-Pearl-Degrade-W36-686072552326c8bc1bcbda58): $700 + $6.49 observed shipping; vincentlopez596, sales/reviews unknown.
- [eBay solid-black wax W29](https://www.ebay.com/itm/227343221934): $700 or best offer; archivevaultnyc, 215 sold, feedback score 303, 100% positive, joined March 2007; shipping varies.
- [Depop solid-black wax W29](https://www.depop.com/products/kuromifan99-black-wax-rick-owens-drkshdw-623c/): $700; kuromifan99, 46 sold, 19-feedback indicator. Could overlap the eBay item; identity unverified.
- [HBX exact-model reference, sold out](https://hbx.com/men/brands/rick-owens-drkshdw/degraded-bias-bootcut-jeans-4-black-pearl-degrade): provisional match to DRKSHDW DU02C5352-SBEDE, Black Pearl Degrade.
- [Grailed terms](https://www.grailed.com/about/terms), [Vinted terms](https://www.vinted.com/terms-and-conditions), [Meta automated collection](https://about.fb.com/news/2021/04/how-we-combat-scraping/), [Depop partner API](https://partnerapi.depop.com/api-docs/), [Buyee fees](https://bc.help.buyee.jp/en/fee/).
