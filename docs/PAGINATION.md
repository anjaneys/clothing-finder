# Public retrieval and continuation

Version 0.4 removes the static six-example experience as the main result collection. Search returns a batch; **Load more** appends another batch and **Show all matching pages** continues serially until the returned sources stop, fail, or the user cancels. Existing cards remain visible while loading. Search, tab or demo changes invalidate in-flight requests; pagination uses the frozen submitted query, fields and photo rather than current draft edits.

## Coverage by source

| Source | Retrieval | Continuation | Boundary |
| --- | --- | --- | --- |
| Poshmark US | Anonymous public HTML; no API key | Opaque `max_id` from embedded page JSON, passed to the same `/search` route | Stop at the observed expanded-recommendation boundary; schema/access failures pause |
| eBay Browse | Official API; credentials required | Validated item offset, 30 items per page | Fixed-price offers only; provider offset ceiling below 10,000 |
| Brave | Licensed search index; key required | Queue of source-group IDs and offsets; 20 results per page | Offsets 0–9, only advance when `more_results_available` is true |
| Other marketplace buttons | Direct source search links | Browse on that website | No automatic connector is implied |

The source's health and coverage are separate. Exhaustion means no further page was returned for that source/search, not that every website or every relevant listing was found. Unknown continuation metadata stays unknown. Provider limits are visible. Static research is a separate collapsed collection and never substitutes for a failed search.

## Poshmark observation

Verified September 14, 2026 against the [public Margiela GAT search](https://poshmark.com/search?query=maison%20margiela%20gat&type=listings&src=dir). The public document contains `window.__INITIAL_STATE__`, with rows under `$_search.gridData.data`, a cursor under `gridData.more.next_max_id`, and canonical listing URLs in JSON-LD `ItemList` entries. The public document route accepts its returned cursor; `page=2` was observed to repeat the first page and is not used.

The query returned 48 rows per page and 199 primary matches before broader recommendations. On the boundary page, per-card `search_tracking_info.match_type` was `mash` for primary rows and `latke` for expanded rows; the latter included unrelated clothes. Expanded rows are excluded, continuation stops, and coverage is marked limited. These are observed page semantics, not a documented API guarantee. A changed schema needs a reviewed fixture/update. Counts and offers change independently of this repository.

Search-card price, currency, size, image, username and availability are recorded as `public_page` observations with a 15-minute recheck hint. Internal condition codes are not guessed. Likes/shares are never converted into sales or reviews. Seller history and destination shipping remain unknown. Relevance and the Legit section do not authenticate an item, including seller-labelled lookalikes that appear in keyword results.

## Recovery and request boundaries

- The strict continuation shape contains source offsets/group IDs or opaque cursors, never arbitrary URLs or credentials. A SHA-256 scope binds query, lane, override presence/values, image and plan version. It prevents accidental cross-search reuse; it is not an authentication token.
- Failed pages retain their retry checkpoint. Duplicate-only and skipped-only pages can continue. Finished or disabled sources do not restart during another source's continuation.
- The client accepts a page only for the current request generation, then appends/deduplicates and commits its cursor. Cancelled or stale responses cannot erase prior cards.
- Each request is bounded by source deadlines, request/page budgets, response-size limits and concurrency. Redirects are returned manually and rejected; the local Workers runtime does not support `redirect: "error"` despite the broader fetch type. See [Cloudflare Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/).
- Paid-source caches remain opt-in and include pagination in their keys; photos and Poshmark results are not cached by the application.
- No login, CAPTCHA, access-denial bypass, internal marketplace API, purchase or seller messaging is involved.

## Validation

Offline fixtures cover 96 public-page records across requests, 120 eBay offers, primary/expanded boundaries, repeated cursors, redirects, disabled sources, invalid scopes, page-cache isolation, retry/cancellation checkpoints, and fair Brave source-group resumption. API smoke checks disable external providers in CI via `POSHMARK_PUBLIC_SEARCH=false`. Live local/browser checks verify the current public route independently of those fixtures.

Public service deployment still needs the roadmap's authentication, account quotas and operations work. Per-process budgets are not multi-user spending limits.
