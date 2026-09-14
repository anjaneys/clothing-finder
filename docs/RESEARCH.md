# Research: stronger clothing discovery and more sources

Reviewed September 13, 2026 using official marketplace, provider and research-project sources. This is an integration research log, not a claim that any new connector is already implemented. Access, fees, inventory and destination eligibility can change.

## Main findings

1. **Improve identity before broadening ranking.** A cheap black-wax Bias Bootcut is not the same offer as a black/pearl degrade pair. Model codes, finish, size, condition and photographs need separate matching signals.
2. **Prefer documented APIs and approved product feeds where available.** eBay, Rakuten and approved StockX access provide useful structured paths. END. advertises affiliate product feeds; SSENSE advertises affiliate catalog access. Approval is still required.
3. **Use a source-specific access mode.** API results, licensed indexed discovery, manual imports and direct marketplace handoffs are different capabilities. A working search URL is not a live inventory connector.
4. **Keep seller risk, item authenticity and buying-route risk separate.** Managed consignment stores may not expose individual seller histories; a proxy is a purchasing/shipping route, not the underlying seller.
5. **Compare total delivered cost only when the route is known.** Direct global checkout can outperform a proxy. Domestic freight, international freight, service/payment fees and import charges must remain separate.

These are design recommendations inferred from the current implementation and sources below. Their effectiveness needs real search and transaction-outcome evaluation.

## Additional marketplaces and buying routes

Priority is a proposed implementation order for designer/archive clothing, not a measured ranking of prices or seller quality. **Handoff** means a verified site or buying route is suitable for link/search/manual-import support; a public discovery API was not verified in this review.

| Priority | Source                                                                                    | Fit and buying route                                                                  | Access and implementation notes                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | [Rakuten Ichiba](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)       | Japanese retailers and resale stores; direct delivery varies by shop, otherwise proxy | Documented item-search API. Current version requires application ID and accessKey. Does not search C2C/flea-market inventory such as Rakuma. Product reviews are not seller reviews.                                                                                             |
| P1       | [END. sale](https://www.endclothing.com/us/sale)                                          | New designer/streetwear sale stock; direct retail checkout                            | [Affiliate program](https://www.endclothing.com/gb/affiliate-program) explicitly advertises product feeds and imagery through Impact. Apply for access; treat as a separate retail price reference.                                                                              |
| P1       | [SSENSE sale](https://www.ssense.com/en-us/men/sale)                                      | New designer items, including the category relevant to Rick Owens searches            | [Affiliate program](https://www.ssense.com/en-gb/affiliates) advertises product catalog access after application review. Public page does not establish the catalog's integration format.                                                                                        |
| P1       | [Vestiaire Collective](https://www.vestiairecollective.com/)                              | Global designer resale                                                                | Handoff. Its [authentication shipping guide](https://faq.vestiairecollective.com/hc/en-us/articles/10961814888337-Buyer-Shipping-with-Authentication) describes a specific route; record the selected route and fees instead of assuming every purchase is physically inspected. |
| P1       | [RAGTAG Global](https://ragtag-global.com/pages/global-shipping-information)              | Japanese designer secondhand, with direct global checkout                             | Handoff. The global store supports broad international delivery; do not require a proxy when direct checkout is eligible. Compare route-specific final totals.                                                                                                                   |
| P1       | [The RealReal](https://www.therealreal.com/faq)                                           | Managed luxury consignment, direct retail-style checkout                              | Handoff. Record condition, store policies and authentication claims; do not invent an individual consignor's review/sales history.                                                                                                                                               |
| P1       | [2nd STREET USA](https://ec.2ndstreetusa.com/pages/faq-1)                                 | Domestic US secondhand fashion                                                        | Handoff. US inventory and shipping policy differ from Japan. Current FAQ describes domestic-only shipping; model it as a separate regional source.                                                                                                                               |
| P1       | [2nd STREET Japan](https://www.2ndstreet.jp/guide/buy/onlinestore)                        | Japanese secondhand inventory                                                         | Handoff. Official buying guide directs overseas customers to partnered WorldShopping BIZ rather than ordinary overseas checkout.                                                                                                                                                 |
| P2       | [Kindal / Kind Online](https://shop.kind.co.jp/)                                          | Japanese designer/archive resale                                                      | Handoff. Buyee documents a supported [Kind Online buying route](https://media.buyee.jp/guide/addtobuyee/en/kind.html). Preserve the original store/item ID.                                                                                                                      |
| P2       | [RINKAN](https://rinkan-online.com/)                                                      | Designer/archive clothing and accessories                                             | Handoff. A [WorldShopping partnership case study](https://www.worldshopping.biz/case/2407-rinkan) establishes a historical supported route; verify the current checkout and destination before quoting a purchase.                                                               |
| P2       | [Yahoo/JDirectItems Fleamarket](https://media.buyee.jp/pr/about_paypay/en/)               | Japanese fixed-price peer resale through Buyee                                        | Handoff. Buyee notes overlap with auction listings, so search results need cross-source deduplication. Keep auctions and fixed-price offers distinct.                                                                                                                            |
| P2       | [StockX](https://developer.stockx.com/portal/getting-started)                             | Apparel catalog and variant-level bid/ask information                                 | Documented developer integration requires approval, API key and OAuth. [API reference](https://developer.stockx.com/portal/api-reference) includes catalog and market data; it does not establish access to each seller's reputation. Bids/asks are not sold-price evidence.     |
| P2       | [GOAT](https://support.goat.com/hc/en-us/articles/115004770188-How-does-GOAT-work)        | Apparel, sneakers and accessories                                                     | Handoff. Retail-partner fulfillment and resale verification routes differ. Display the actual route, not a blanket authenticity conclusion.                                                                                                                                      |
| P3       | [Xianyu](https://www.alibabagroup.com/en-US/about-alibaba-businesses-1747081802473799680) | Chinese secondhand fashion and archive discovery                                      | Handoff. [Superbuy](https://www.superbuy.com/en/page/shoppingagent/) supports a purchasing route with extra secondhand conditions and fees. Check returns before purchase. An item on Xianyu is not automatically a replica.                                                     |
| P3       | [Tmall](https://home.alibabagroup.com/en-US/about-alibaba-businesses-1744514231081893888) | Chinese brand storefronts and new retail alternatives                                 | Handoff or approved partner access. [Superbuy's guide](https://login.superbuy.com/en/page/noviceguide/) documents product-link purchasing. Treat brand claims and item authenticity at the listing level.                                                                        |

YOOX is another retail-sale candidate for a later research pass. It is not yet an accepted connector: verify current feed availability, delivery regions and representative product records first.

### Existing coverage to strengthen

Keep Grailed, Depop, eBay, Vinted, Facebook Marketplace, Etsy, Poshmark, Mercari Japan, Rakuma and Yahoo Auctions, plus Taobao, 1688 and Weidian candidate searches. Current implementation primarily provides handoffs, with optional eBay and Brave adapters.

- [Grailed's terms](https://www.grailed.com/about/terms), [Vinted's terms](https://www.vinted.com/terms-and-conditions) and [Meta's explanation of automated collection](https://about.fb.com/news/2021/04/how-we-combat-scraping/) establish access constraints. Investigate authorized integrations instead of CAPTCHA/login workarounds.
- [Depop's partner API](https://partnerapi.depop.com/api-docs/) is a selling-partner integration, not evidence of an unrestricted public clothing-discovery endpoint.
- [Etsy developer documentation](https://developers.etsy.com/documentation/) describes app access. Validate required credentials, scope and product fit before adding an adapter.
- No general public discovery API for 1688, Weidian, Mercari JP or Yahoo Fleamarket was verified in this review. Unknown access is not proof that an API does not exist.

### Proxies are a separate layer

| Service                                                                                                                                              | What the app should record                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Buyee](https://bc.help.buyee.jp/en/fee/)                                                                                                            | Original item/store, supported route, purchase fee, optional plan, domestic freight and international freight. Preserve whether the charge is per item or order.  |
| [ZenMarket](https://zenmarket.jp/en/fees.aspx)                                                                                                       | Store-specific service fee, funding/payment fees, optional services and freight. Current service fees vary by marketplace; do not hard-code one universal amount. |
| [WorldShopping](https://help.worldshopping.global/hc/en-us/articles/4830454920606-What-is-WorldShopping-How-the-service-works-and-the-usage-process) | Supported store and destination, service and shipping fees, and checkout restrictions. Shop loyalty points and coupons may not transfer through a proxy account.  |
| [Superbuy](https://login.superbuy.com/en/page/guide/feecomposition/)                                                                                 | China domestic item/shipping costs, extra service or secondhand fees, and international delivery quote. Record any return/exchange restrictions for the source.   |

Fetch or enter current quotes rather than baking this research date's fee amounts into code. Warehouse photos can document received condition; they do not themselves authenticate an item.

## Engineering ideas to evaluate

### API retrieval and source budgets

Use [eBay Browse](https://developer.ebay.com/api-docs/buy/browse/overview.html) as the first complete adapter. Its documented keyword and image-search paths support a practical text-versus-image evaluation. Production access and account eligibility must be checked, rather than inferred from having a token.

For [Brave Web Search](https://api-dashboard.search.brave.com/app/documentation/web-search), test source-specific queries, language/country targeting and bounded pagination. This is indexed discovery, not a freshness guarantee. Some searches will resolve to shops, sold pages or editorial content. Brave's [API storage guidance](https://brave.com/search/api/) requires a plan granting storage rights for stored API results; API access does not grant rights to third-party page content.

The [eBay authorization guide](https://developer.ebay.com/develop/guides/sell/authorization) distinguishes application tokens minted with client credentials from user-token refresh grants. Renew application tokens from the returned expiry and coalesce simultaneous renewals. Its [API limits](https://developer.ebay.com/develop/get-started/api-call-limits) also flag additional Buy API production-access requirements. Use account-specific limits when connected.

[Brave rate-limit documentation](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting) provides quota/reset behavior for bounded retries. Rate-limit errors, missing credentials, denied access and zero results need different source states.

Recommended implementation: a bounded worker pool returns source status as it completes; each adapter declares rate and retention limits. Structured source data outranks snippet guesses. Retry transient failures selectively and surface partial results without relabelling them as complete coverage.

### Identity and multilingual search

Build a target profile that separates confirmed inputs from inferred ones: `brand`, `model`, `styleCode`, `finish`, `material`, `silhouette`, `size`, `measurements`, `condition`, and reference images. Let users correct uncertain fields before a broad search.

Use aliases and native-language product vocabulary to expand queries. For the jeans example, preserve the style code and degrade finish while exploring local terms for bootcut/flared denim. Do not append the same Chinese keywords to every unrelated brand/item.

Visual embeddings and OCR are candidate approaches, not implemented capabilities. Compare them against the current text-only baseline on a held-out set with exact matches, similar silhouettes and deliberately confusing variants. A similarity score is not an authenticity score.

Two concrete experiments are supported by primary sources:

- [SigLIP 2](https://arxiv.org/abs/2502.14786) describes multilingual image-text retrieval and localization improvements, including variants that preserve aspect ratio. Test frozen embeddings on permitted clothing images. Better discrimination of nearly identical denim finishes is a project hypothesis, not a result established by the paper.
- [Reciprocal rank fusion](https://docs.opensearch.org/latest/search-plugins/search-pipelines/score-ranker-processor/) combines ranked lists without assuming keyword, visual and translated-query scores share a scale. Start with a small local implementation; adopting an OpenSearch deployment is not required to evaluate the idea.

Build at least 300 labelled candidate pairs across the proposed 50 target identities. Keep duplicate photographs and the same target identities out of both training/tuning and held-out evaluation. Report Recall@20, Precision@5, variant-confusion rate, latency and cost by language.

### Seller reliability and explainable ranking

Preserve evidence source, reporting period and observation date before scoring. Unknown sales are not zero sales; product reviews are not seller reviews; established retail stores need a different evidence schema from casual sellers.

Use separate values for match quality, seller reliability, authenticity evidence, buyer protection and delivered-cost completeness. An experimental combined ranking can later trade off those values, but should never conceal unknown seller evidence or missing shipping behind a single “best deal” number.

Asking-price medians can be misleading when inventory is stale, duplicated, damaged or a different variant. Treat the current 40%-of-median rule as a transparent heuristic requiring compatible comparables, not a trained scam detector. New-seller, clearance and consignment cases belong in its false-positive test set.

If outcome data later supports a probability model, use separate fitting/calibration data and a chronological, seller-separated holdout. [Scikit-learn's calibration documentation](https://scikit-learn.org/stable/modules/calibration.html) explains reliability curves and calibration evaluation; a single Brier score does not isolate calibration quality. This is a future experiment, not a reason to present the current heuristic as a probability.

### Evaluation before expansion

Track useful results per source, first-page exact-match precision, variant-confusion rate, stale/sold result rate, evidence coverage, search latency and provider cost. A source with many weak results may add less value than a smaller archive store with precise matching.

Suggested experiments:

1. Keyword baseline versus tag OCR plus model-code query expansion.
2. Text-only ranking versus image-assisted reranking, measured on the same held-out searches.
3. One all-domain query versus budgeted source/language queries.
4. Retail feed/API versus handoff/import for coverage, freshness and maintenance cost.
5. Direct checkout versus proxy for the same eligible Japanese listing, including all known fees.

The [roadmap](../ROADMAP.md) turns these findings into phases and exit checks. New integrations remain proposed until permission, credentials, representative records and production behavior have been verified.

## Retrieval implementation references — September 13, 2026

These primary references informed the implemented contracts and synthetic fixtures; they do not establish this account's production eligibility.

- [eBay application authorization](https://developer.ebay.com/develop/guides/sell/authorization): application-token acquisition with client credentials and re-minting, distinct from a user refresh-token grant.
- [eBay Browse OpenAPI schema](https://developer.ebay.com/api-docs/master/buy/browse/openapi/3/buy_browse_v1_oas3.json): text/image endpoints, item-offset pagination, item IDs and seller feedback fields. Image requests contain raw base64 in the JSON `image` property. Feedback score is net feedback, not the seller review or sales count; unsupported metrics stay unknown.
- [eBay Browse filters](https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html): fixed-price filtering keeps auction starting bids out of API asking-price results.
- [Brave web search reference](https://api-dashboard.search.brave.com/api-reference/web/search/get): up to 20 results per page, page-index offset and `more_results_available`; overlapping results require deduplication.
- [Brave rate limiting](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting): paired quota windows and reset durations. Unlimited windows must not create artificial cooldowns.
- [Brave Search API plans](https://brave.com/search/api/): confirm your agreement's storage rights before enabling result caching. The application defaults to no provider result cache.

Implementation limits: eBay US scope, three pages per provider search, source groups rather than exhaustive fan-out, conservative structural listing URLs, and text-derived metadata matching. No visual-embedding accuracy measurement, automated authentication, or universal marketplace access is claimed.
