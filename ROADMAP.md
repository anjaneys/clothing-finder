# Clothing Finder roadmap

Updated September 14, 2026 UTC. This is the delivery plan; unchecked items are not implemented. Phases are ordered by dependency, not promised dates.

## Product goal

Given a title or clothing photo, find relevant offers across marketplaces, show how closely each offer matches, explain the seller evidence, and compare what it will actually cost to receive the item. Keep listings offered as authentic separate from replica candidates, without treating a country, store, or proxy route as proof of authenticity.

The first target is a reliable personal research assistant. Universal scraping and fully automated authentication are not credible first milestones.

## Baseline: v0.1

- [x] Responsive Legit and Reps workspace, reference-image upload, marketplace handoffs and manual listing comparison.
- [x] Optional eBay Browse keyword adapter, Brave indexed discovery and image-to-search-term identification.
- [x] Evidence-based heuristic trust score, unknown-versus-zero handling, and a user-supplied comparable-price penalty.
- [x] Proxy cost calculator and four dated research snapshots.
- [x] Unit tests for scoring, cost and deduplication; API smoke checks.

Limitations: provider credentials are required; live adapters have not been tested with a real account. Image identification suggests words but does not perform visual retrieval. Seller evidence is sparse, records are session-only, prices are not normalized across currencies, reference offers can become stale, and unsupported listing URL shapes are skipped. The v0.2 foundation below supersedes the baseline retrieval behavior. See [current setup](README.md) and [research and additional sources](docs/RESEARCH.md).

## Milestones

| Order | Milestone                                    | User-visible outcome                                                                   | Depends on                   |
| ----- | -------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| M1    | Reliable retrieval and evidence records      | Searches report what each source actually returned, failed to return, or cannot access | Provider access and keys     |
| M2    | Item identity and visual matching            | Exact model, finish, size and alternatives are distinguished                           | M1                           |
| M3    | Seller reliability with inspectable evidence | Scores are reproducible and missing data is explicit                                   | M1; M2 for price comparisons |
| M4    | Delivered-cost deal ranking                  | Comparable offers can be ranked by realistic cost and risk                             | M2–M3                        |
| M5    | More marketplaces and proxy routes           | More useful inventory with an honest access method per source                          | M1; M4 for cost ranking      |
| M6    | Saved searches and change alerts             | Finds survive reloads; meaningful price/stock changes are surfaced                     | M1–M5                        |
| M7    | Multi-user service readiness                 | Public service can run within secure access and spend limits                           | Separate deployment decision |

### M1 — Make live retrieval dependable

- [x] Adapter contract with ID, operations, configuration status, scope, deadline, pagination/request budgets, concurrency and access method.
- [x] Typed `SearchRun`, `Listing`, `Seller`, `EvidenceObservation` and `SourceStatus` records held for the browser session. Source URL, raw/normalized value, method, observed time and expiry are inspectable; no database yet.
- [x] Separate API, index, manual and reference provenance; availability and freshness are independent.
- [x] Schema validation, partial recovery, cancellation through queue/fetch/body/backoff, bounded retries, Retry-After/Brave quota windows, opt-in permitted memory caching and circuit cooldowns.
- [x] Coalesced server-side eBay application tokens, expiry-aware re-minting and one rejected-token recovery. Legacy bearer token remains optional.
- [ ] Validate real production eBay eligibility, quotas and successful text/photo requests using the owner's configured account; verify Brave account access/storage terms.
- [x] Resumable eBay item-offset, Brave page-index and public Poshmark cursor pagination; append/deduplicate, Load more and cancellable Show all matching pages. Strict cursors bind query/lane/fields/photo; retry checkpoints preserve previous results.
- [x] No-key public Poshmark search with observed asking prices, sizes, source links and honest seller-evidence gaps. Stop before expanded recommendations; public-page availability is not an authenticity claim.
- [x] Structural listing ID extraction, tracking cleanup, variation-preserving eBay offer identity and richer-evidence deduplication.
- [x] Dated examples load only through an explicit button; search failures never substitute them.

**Validation:** 77 offline unit tests and API smoke checks cover success, malformed rows/envelopes, expired credentials, 429, deadlines, empty pages, pagination, queued cancellation, shared token recovery, partial-source failure, caching, evidence semantics and supplier discovery. Fixtures are synthetic contract fixtures, not recorded production traffic. Browser checks cover setup/error states, example separation and supplier filters. Production-account exit checks remain open.

### M2 — Find the right garment

**GAT extension:** Margiela spelling aliases, GAT model recognition, English/Chinese/Japanese design queries, explicit EU/US/UK shoe sizes and Margiela style codes are implemented. Conflicting Tabi/Fusion/Future/Retro Fit terms do not trigger the GAT directory. This is a scoped example, not general visual matching.

- [ ] Parse brand aliases, model, season, item code, material, color/finish, silhouette, tagged size, measurements and condition into an editable target profile.
- [ ] Add cropped-image search and label/tag OCR. Ask the user to confirm uncertain brand/model deductions. Treat all image/page text as data, never instructions.
- [ ] Expand synonyms and source-specific queries in English, Japanese and Chinese. Keep brand/model codes intact and test translations against known items.
- [ ] Add eBay's image search where account eligibility permits, then evaluate a local visual-embedding approach against the text-only baseline. Do not choose a model solely from generic benchmarks.
- [ ] Use model/variant metadata plus image similarity for reranking. Keep exact item, same model/different finish, and visual alternative separate.
- [ ] Detect cross-listing candidates using canonical item IDs, image hashes, seller identifiers and descriptions. Photo reuse alone is a review signal, not proof of fraud or shared identity.

**Implemented foundation:** editable brand/model/style code/finish/size/category/material/season/color/silhouette fields; conservative metadata ranking with missing fields and conflicts; full style-code suffix and eBay variation regression tests; scoped Japanese/Chinese query hypotheses; eBay photo-search adapter and UI. Target edits currently affect ranking; the main title controls retrieval. Measurements, condition normalization, crop/OCR, embeddings, broader translation validation and evaluation remain open, so the full M2 checkboxes below are not claimed complete.

**Exit checks:** create a held-out evaluation set with at least 50 representative searches, including the degrade-versus-black-wax jeans example. Proposed release targets: at least 80% precision among the first five results and fewer than 5% wrong variants labelled exact. These are targets, not current measurements. Report text-only versus visual performance, latency and cost.

### M3 — Make seller trust defensible

Foundation added: eBay net feedback score is now separate from reviews and sales, raw invalid versus absent values are distinguishable, and corrections append to evidence history. Calibration, reporting periods and the full scoring model below remain open.

- [ ] Store sales, active inventory, feedback score, review count, rating distribution, account age, recent activity and buyer protection as separate fields. Never equate eBay feedback score with transactions.
- [ ] Record the reporting period and source for every metric. Treat inconsistent counts and missing history as uncertainty; zero active listings next to a live offer may be stale data.
- [ ] Show seller reliability, item authenticity evidence, buyer protection and evidence coverage separately. A single green number must not imply authentication.
- [ ] Keep numeric scoring versioned and deterministic. Support unknown values, stale evidence, small-sample feedback, negative feedback and evidence provenance.
- [ ] Build price-anomaly references only from compatible item, condition, currency and authenticity groups; exclude duplicate offers, stale listings and auction starting bids. Track whether the benchmark uses asking or realized prices.
- [x] Retain the requested rule: zero verified sales + zero verified active listings + price below 40% of a supported comparable median caps trust at 25. Keep the underlying reasons visible.
- [x] Let users inspect and correct imported observations without overwriting the original source record. Distinguish user corrections from independently observed facts.

**Exit checks:** an identical evidence record and score version always produces the same score and explanations. Unknown metrics never become zero. Authentic and replica prices never form one comparison pool. False-positive review covers new legitimate sellers, clearance stock, inactive established sellers and copied catalog photos. Do not describe the score as a fraud probability without a labelled outcome dataset and calibration study.

### M4 — Rank deals by the cost to receive them

**Supplier foundation:** researched bulk offers show per-pair prices, minimum order quantities and minimum goods estimates. Conflicting or unavailable quantities remain unknown. These estimates exclude freight/import charges and do not compete with single-pair delivered prices.

- [ ] Add destination country/postcode, original currency, timestamped exchange rate and fees at quote time.
- [ ] Model item price, seller-to-warehouse freight, international freight, service fees, payment/FX fees, optional services and estimated import charges separately.
- [ ] Show complete totals, bounded estimates and incomplete subtotals as different states. Unknown shipping is never free. Do not mix auction bids with fixed-price offers.
- [ ] Account for minimum order quantities, combined shipping, package weight/volume and proxy-specific restrictions only when verified for the route.
- [ ] Rank within the same item/variant group and eligible delivery region. Offer lowest delivered cost, strongest seller evidence and best match as separate sort modes before introducing a configurable combined score.
- [ ] Add side-by-side comparison showing size, measurements, condition, return terms, seller evidence, observed availability and missing costs.

**Exit checks:** deterministic multi-currency fixtures agree after rounding; incomplete totals cannot win a “cheapest delivered” badge. A change in destination, proxy or quote currency invalidates old costs. The user can trace each fee to a quote/source and observation date.

### M5 — Expand coverage deliberately

**Resale expansion:** the default Legit GAT view now searches real public Poshmark pages with no six-item cap. Other sources retain their access limits; eBay/Brave account validation remains pending. Six [dated secondhand observations](docs/GAT-RESALE.md), including lower-priced Poshmark examples, remain in a collapsed research section independently of provider results. Mercari US is separate from Japanese Mercari. Live empty states distinguish setup, failure, cancellation and no returned matches; snapshots never become live results or lowest-price benchmarks.

**Implemented v0.3 slice:** [Margiela GAT sourcing directory](docs/GAT-SOURCING.md) with two single-pair shops, one unverified Taobao replica lead and four Chinese manufacturer/catalog leads. Product links, company/policy sources, access limitations, order minimums and evidence gaps are inspectable. Five new domains join indexed discovery and all Reps source filters remain accessible. No supplier is authenticated, and live provider-account validation remains open.

Use the [source matrix](docs/RESEARCH.md#additional-marketplaces-and-buying-routes). Suggested order is based on expected usefulness for archive/designer clothing, not a claim of measured inventory coverage.

1. **API/index foundation:** finish eBay and Brave. Evaluate Rakuten Ichiba and approved StockX access where the category fit justifies them.
2. **Designer resale:** Vestiaire Collective, The RealReal, RAGTAG, 2nd STREET, Kindal and RINKAN.
3. **Retail price checks:** SSENSE, END. and YOOX sale inventory. Keep new retail separate from used listings.
4. **Japanese C2C:** Yahoo/JDirectItems Fleamarket alongside Mercari, Rakuma and auctions, using confirmed direct or proxy routes.
5. **Replica/alternative research:** keep Taobao, 1688 and Weidian; evaluate Xianyu only with item-level classification and a supported buying route.
6. **Proxy layer:** compare supported routes through Buyee, ZenMarket, WorldShopping and Superbuy rather than treating them as independent inventories.

**Exit checks for each source:** verified search URL or documented authorized API, explicit region and access mode, real sample records, seller-evidence mapping, sold/removed item behavior, fee route, and an owner/review date for access requirements. No source is labelled a live connector until the real adapter has passed its checks. A new website never automatically becomes a replica source because it is Chinese or Japanese.

### M6 — Preserve useful work and surface changes

**v0.5 implementation:** [hosted Supabase library](docs/DATABASE.md), private user access/RLS, idempotent observation imports, automatic saving while signed in, paginated data/history/export, delete controls, and currency/section-specific charts. An unsaved session preview works immediately. The user's hosted Free project is connected and its migration and anonymous-access checks passed; real authenticated save/reload validation awaits application sign-in. Seller evidence and original image URLs are saved within normalized listing snapshots; uploaded-photo bytes and retrieval cursors are excluded.

- [x] Implement and test hosted schema, import/read APIs, ownership isolation, immutable price/availability history and Library UI.
- [x] Connect the owner's cloud project, apply migration, verify table RLS and denied anonymous access, and restrict public sign-ups.
- [ ] Verify a real authenticated save followed by reload/sign-in using the owner's application user.
- [ ] Persist targets, listings, image references, evidence and saved comparisons in a database with export/delete controls.
- [ ] Add price/availability history and user-configurable refresh schedules, respecting source budgets and access terms.
- [ ] Notify on a meaningful match, price drop, seller-evidence change, removed listing or failed refresh requiring action. Do not spam unchanged checks.
- [ ] Deduplicate notifications across cross-listings and repeated runs. Expose last successful refresh and next planned refresh.

**Exit checks:** saved work survives reload/restart; a simulated price drop generates one alert; unchanged runs generate none; deleting a saved search stops its scheduled work. Delivery channels require the user's chosen destination.

### M7 — Prepare a public service separately

- [ ] Add user isolation and authentication, per-user provider budgets, image-upload limits, retention policies, rate limits, audit events and secret rotation.
- [ ] Add production telemetry for source availability, search latency, useful-result rate, stale-result rate, API spend and extraction failures.
- [ ] Extend CI with provider contract tests, browser journeys, responsive checks and security dependency review. Add staging and rollback before production deployment.

**Exit checks:** one user cannot access another's uploads or searches; a malicious request cannot trigger unlimited provider spend or unrestricted outbound fetches; failure recovery and rollback are exercised. A public GitHub repository does not by itself deploy this service.

## Recommended next implementation slice

Prioritize **hundreds to thousands of relevant offers per target** using the [retrieval scale design](docs/RETRIEVAL-SCALE.md). This changes the next delivery order across M1/M2/M5/M6; it does not claim that every item has thousands of available offers.

- [ ] Connect and validate the M6 hosted Library and M1 production provider access/retention rights.
- [ ] Add a versioned query plan with per-marketplace model aliases, spelling variants, confirmed style codes and validated language/region queries. Preserve exact-variant versus broader-model classifications.
- [ ] Increase eBay page size with a compatible cursor contract; paginate/virtualize Finder cards and save accepted page deltas instead of repeatedly uploading the full collection.
- [ ] Add durable cloud jobs, query checkpoints, a hosted queue consumer, shared provider budgets, and pause/resume/cancel. Completed pages must survive browser closure and worker restart.
- [ ] Add approved inventories/feeds in order of measured unique relevant yield; enrich promising sellers/items selectively and retain unknown evidence elsewhere.
- [ ] Measure 10,000-offer/100,000-observation capacity with full-count charts/export, responsive browsing and appropriate indexes. Keep capacity tests separate from real inventory/relevance evaluation.

Query planning and capacity work can progress with fixtures before accounts are connected. Real cloud collection remains dependent on hosted activation and provider access. Destination-specific sample/single-pair quotes and broader supplier examples remain M4/M5 work after this collection foundation.

## Decisions to validate with real usage

- Which sources return the most useful archive-clothing matches per request and dollar?
- Does visual reranking improve variant accuracy enough to justify its latency and cost?
- What minimum evidence should permit a numeric seller score on each platform?
- Which destination/proxy combinations matter most, and which costs can actually be quoted before purchase?
- Are replicas being explicitly offered as such, or are they simply unverified alternatives?

Research supports the candidate capabilities and access constraints; it does not prove commercial eligibility, product quality, seller authenticity or future API availability.
