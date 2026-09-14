import { z } from "zod";
import { createPoshmarkAdapter } from "./poshmark.ts";
import type { Coverage, SourceCursors } from "./pagination.ts";
import { unknownEvidence, type Lane, type Listing } from "../finder-types.ts";
import { recordEvidence } from "../evidence.ts";
import { identifyListingUrl } from "../listing-identity.ts";
import { marketplaces } from "../marketplaces.ts";
import { parseIntent, queryVariants } from "../item-intent.ts";
import { createEbayTokenManager, type EbayCredentials } from "./ebay-auth.ts";
import {
  abortError,
  createTransport,
  ProviderError,
  Semaphore,
  type RequestBudget,
} from "./transport.ts";
import {
  sourceMessages,
  type ProviderResult,
  type RuntimeOptions,
  type SearchAdapter,
  type SearchInput,
  type SourceDefinition,
  type SourceState,
} from "./types.ts";

const numericString = /^-?\d+(?:\.\d+)?$/;
export function numeric(value: unknown, signed = false): number | null {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && numericString.test(value))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) && (signed || result >= 0) ? result : null;
}
const integer = (value: unknown, signed = false) => {
  const n = numeric(value, signed);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};
const currencies = new Set(Intl.supportedValuesOf("currency"));
const cleanText = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const httpsImage = (value: unknown) => {
  try {
    const u = new URL(typeof value === "string" ? value : "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};

const ebayEnvelope = z
  .object({
    itemSummaries: z.array(z.unknown()).optional(),
    total: z.number().nonnegative().optional(),
    next: z.string().optional(),
  })
  .refine((value) => Array.isArray(value.itemSummaries) || value.total === 0);
const ebayItem = z.object({
  itemId: z.string().min(1),
  title: z.string().min(1).max(1000),
  itemWebUrl: z.string().url(),
  image: z.object({ imageUrl: z.string() }).optional(),
  price: z.object({ value: z.unknown(), currency: z.unknown() }).optional(),
  condition: z.string().optional(),
  seller: z
    .object({
      username: z.string().optional(),
      userId: z.string().optional(),
      feedbackScore: z.unknown().optional(),
      feedbackPercentage: z.unknown().optional(),
    })
    .optional(),
});
const braveEnvelope = z
  .object({
    query: z
      .object({ more_results_available: z.boolean().nullable().optional() })
      .nullable()
      .optional(),
    web: z.object({ results: z.array(z.unknown()) }).optional(),
  })
  .refine((value) => value.web !== undefined || value.query !== undefined);
const braveItem = z.object({
  title: z.string().min(1).max(1000),
  url: z.string().url(),
  description: z.string().max(20000).optional(),
});

type Progress = {
  listings: Listing[];
  pages: number;
  skipped: number;
  hasMore: boolean;
  queryTruncated?: boolean;
  next?: SourceCursors[keyof SourceCursors];
  coverage?: Coverage;
};
export interface DiscoveryConfig {
  ebay: EbayCredentials;
  braveKey: string;
  publicSearch?: boolean;
  /** Explicit opt-in only after verifying the provider plan permits storage. Defaults to no result caching. */
  cache?: { ebay?: number; brave?: number };
}

export function createAdapters(
  config: DiscoveryConfig,
  options: RuntimeOptions = {},
): SearchAdapter[] {
  const transport = createTransport(options);
  const auth = createEbayTokenManager(config.ebay, options);
  const now = transport.now;

  function adapter(
    definition: SourceDefinition,
    configured: () => boolean,
    execute: (
      input: SearchInput,
      budget: RequestBudget,
      progress: Progress,
    ) => Promise<void>,
  ): SearchAdapter {
    const slots = new Semaphore(definition.maxConcurrent);
    let failures = 0,
      circuitUntil = 0,
      rateUntil = 0;
    const cache = new Map<string, { until: number; result: ProviderResult }>();
    const ttl =
      Math.min(
        300,
        Math.max(0, config.cache?.[definition.id as "ebay" | "brave"] ?? 0),
      ) * 1000;
    if (ttl > 0) definition.retention = "approved_memory_cache";
    return {
      definition,
      configured,
      async search(input) {
        const started = now();
        const deadline = AbortSignal.timeout(definition.timeoutMs);
        const signal = input.signal
          ? AbortSignal.any([input.signal, deadline])
          : deadline;
        const budget: RequestBudget = {
          requests: 0,
          maxRequests: definition.maxRequests,
          deadlineAt: started + definition.timeoutMs,
          signal,
        };
        const progress: Progress = {
          listings: [],
          pages: 0,
          skipped: 0,
          hasMore: false,
          next: input.continuation?.sources[definition.id],
        };
        const status = (
          state: SourceState,
          error?: ProviderError,
        ): ProviderResult => ({
          listings: progress.listings,
          status: {
            id: definition.id,
            name: definition.name,
            state,
            message: sourceMessages[state],
            count: progress.listings.length,
            requests: budget.requests,
            pages: progress.pages,
            skipped: progress.skipped,
            hasMore: progress.hasMore,
            next: progress.next,
            coverage: error
              ? "blocked"
              : (progress.coverage ??
                (progress.hasMore ? "more" : "exhausted")),
            fromCache: false,
            startedAt: new Date(started).toISOString(),
            finishedAt: new Date(now()).toISOString(),
            elapsedMs: now() - started,
            operation: input.imageBase64 ? "image" : "text",
            ...(progress.queryTruncated ? { queryTruncated: true } : {}),
            ...(error
              ? {
                  errorCode: error.code,
                  ...(error.retryAfterMs !== undefined
                    ? { retryAfterMs: error.retryAfterMs }
                    : {}),
                }
              : {}),
          },
        });
        if (input.signal?.aborted) {
          progress.coverage = "blocked";
          return status("cancelled");
        }
        if (
          !definition.lanes.includes(input.lane) ||
          (input.imageBase64 && !definition.operations.includes("image"))
        ) {
          progress.next = undefined;
          progress.coverage = "unknown";
          return status("not_applicable");
        }
        if (!configured()) {
          progress.next = undefined;
          progress.coverage = "unknown";
          return status("not_configured");
        }
        if (input.continuation && !input.continuation.sources[definition.id])
          return status("not_requested");
        if (rateUntil > now())
          return status(
            "rate_limited",
            new ProviderError("rate_limited", rateUntil - now()),
          );
        if (circuitUntil > now())
          return status(
            "circuit_open",
            new ProviderError("circuit_open", circuitUntil - now()),
          );
        const key = `${input.lane}:${input.query.trim().toLowerCase()}:${JSON.stringify(input.continuation?.sources[definition.id] ?? null)}`;
        // Never cache uploaded image searches; result caching is disabled without explicit permission.
        if (ttl > 0 && !input.imageBase64) {
          const prior = cache.get(key);
          if (prior && prior.until > now())
            return {
              listings: structuredClone(prior.result.listings),
              status: {
                ...prior.result.status,
                fromCache: true,
                requests: 0,
                elapsedMs: 0,
              },
            };
          cache.delete(key);
        }
        let release: (() => void) | undefined;
        try {
          release = await slots.acquire(signal);
          if (signal.aborted) throw abortError(signal);
          if (rateUntil > now())
            throw new ProviderError("rate_limited", rateUntil - now());
          if (circuitUntil > now())
            throw new ProviderError("circuit_open", circuitUntil - now());
          await execute(input, budget, progress);
          failures = 0;
          const result = status(
            progress.hasMore || progress.skipped
              ? "partial"
              : progress.listings.length
                ? "ok"
                : "empty",
          );
          if (
            ttl > 0 &&
            !input.imageBase64 &&
            ["ok", "empty"].includes(result.status.state)
          ) {
            if (cache.size >= 40) cache.delete(cache.keys().next().value!);
            cache.set(key, {
              until: now() + ttl,
              result: structuredClone(result),
            });
          }
          return result;
        } catch (error) {
          const safe = signal.aborted
            ? abortError(signal)
            : error instanceof ProviderError
              ? error
              : new ProviderError("unavailable");
          if (
            ["unavailable", "timeout", "invalid_response"].includes(safe.code)
          ) {
            if (++failures >= 3) {
              circuitUntil = now() + 30000;
              failures = 0;
            }
          }
          if (safe.code === "rate_limited")
            rateUntil = now() + (safe.retryAfterMs ?? 1000);
          if (safe.code === "cancelled") {
            progress.listings = [];
            progress.next = input.continuation?.sources[definition.id];
          }
          return status(progress.listings.length ? "partial" : safe.code, safe);
        } finally {
          release?.();
        }
      },
    };
  }

  const ebayDefinition: SourceDefinition = {
    id: "ebay",
    name: "eBay Browse",
    operations: ["text", "image"],
    lanes: ["legit"],
    region: "EBAY_US",
    access: "authorized_api",
    timeoutMs: options.timeoutMs ?? 20000,
    maxPages: Math.min(options.maxPages ?? 3, 5),
    maxRequests: options.maxRequests ?? 6,
    maxConcurrent: 2,
    retention: "request_only",
  };
  const ebay = adapter(
    ebayDefinition,
    auth.configured,
    async (input, budget, progress) => {
      const path = input.imageBase64
        ? "/buy/browse/v1/item_summary/search_by_image"
        : "/buy/browse/v1/item_summary/search";
      const first = new URL(`https://api.ebay.com${path}`);
      if (!input.imageBase64)
        first.searchParams.set("q", input.query.slice(0, 100));
      progress.queryTruncated = !input.imageBase64 && input.query.length > 100;
      first.searchParams.set("limit", "30");
      first.searchParams.set("offset", "0");
      first.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
      let offset = input.continuation?.sources.ebay?.offset ?? 0,
        refreshed = false;
      progress.next = { offset };
      let token = await auth.get(budget.signal);
      while (progress.pages < ebayDefinition.maxPages) {
        const url = new URL(first);
        url.searchParams.set("offset", String(offset));
        const request = () =>
          transport.json(
            url.href,
            {
              method: input.imageBase64 ? "POST" : "GET",
              headers: {
                Authorization: `Bearer ${token.value}`,
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
                ...(input.imageBase64
                  ? { "Content-Type": "application/json" }
                  : {}),
              },
              ...(input.imageBase64
                ? { body: JSON.stringify({ image: input.imageBase64 }) }
                : {}),
            },
            budget,
          );
        let response: unknown;
        try {
          response = await request();
        } catch (error) {
          if (
            !(error instanceof ProviderError) ||
            error.code !== "auth_error" ||
            !token.managed ||
            refreshed
          )
            throw error;
          refreshed = true;
          auth.invalidate(token.value);
          token = await auth.get(budget.signal);
          response = await request();
        }
        const parsed = ebayEnvelope.safeParse(response);
        if (!parsed.success) throw new ProviderError("invalid_response");
        progress.pages++;
        for (const raw of parsed.data.itemSummaries ?? []) {
          const parsedItem = ebayItem.safeParse(raw);
          if (!parsedItem.success) {
            progress.skipped++;
            continue;
          }
          const item = parsedItem.data;
          let identity;
          try {
            identity = identifyListingUrl(item.itemWebUrl);
          } catch {
            identity = null;
          }
          if (!identity || identity.sourceId !== "ebay") {
            progress.skipped++;
            continue;
          }
          const value = numeric(item.price?.value);
          const currency =
            typeof item.price?.currency === "string" &&
            currencies.has(item.price.currency)
              ? item.price.currency
              : "XXX";
          const percentage = numeric(item.seller?.feedbackPercentage);
          const checkedAt = new Date(now()).toISOString();
          const listing = recordEvidence(
            {
              id: `ebay-${item.itemId}`,
              sourceId: "ebay",
              sourceItemId: item.itemId,
              title: cleanText(item.title),
              platform: "eBay",
              url: identity.canonicalUrl,
              image: httpsImage(item.image?.imageUrl),
              price: currency === "XXX" ? null : value,
              currency,
              shipping: null,
              size: parseIntent(item.title).fields.size
                ? /^\d{2}$/.test(parseIntent(item.title).fields.size!)
                  ? `W${parseIntent(item.title).fields.size}`
                  : parseIntent(item.title).fields.size!
                : "Not specified",
              condition: item.condition ?? "Not specified",
              lane: "legit",
              seller:
                item.seller?.username ??
                item.seller?.userId ??
                "Seller unknown",
              evidence: {
                ...unknownEvidence,
                feedbackScore: integer(item.seller?.feedbackScore, true),
                positiveRate:
                  percentage !== null && percentage <= 100
                    ? percentage / 100
                    : null,
              },
              availability: "available",
              match: "related",
              source: "live",
              checkedAt,
              notes:
                "Observed through eBay Browse. Net feedback score is not a review count or a sales count. Check destination shipping, condition and item details on eBay.",
              authenticity:
                "Offered in resale search · authenticity unverified",
            },
            "live_api",
          );
          const rawFields: Record<string, unknown> = {
            price: item.price?.value,
            currency: item.price?.currency,
            feedbackScore: item.seller?.feedbackScore,
            positiveRate: item.seller?.feedbackPercentage,
          };
          for (const observation of listing.observations!) {
            if (
              [
                "sold",
                "active",
                "reviews",
                "accountAgeDays",
                "photos",
              ].includes(observation.field)
            )
              observation.unknownReason = "not_supported";
            if (!(observation.field in rawFields)) continue;
            const rawValue = rawFields[observation.field];
            observation.rawValue =
              typeof rawValue === "string"
                ? rawValue.slice(0, 100)
                : typeof rawValue === "number" && Number.isFinite(rawValue)
                  ? rawValue
                  : null;
            if (observation.value === null)
              observation.unknownReason =
                rawValue === undefined || rawValue === null
                  ? "not_provided"
                  : "invalid";
          }
          progress.listings.push(listing);
        }
        progress.hasMore = !!parsed.data.next;
        if (!parsed.data.next) {
          progress.next = undefined;
          break;
        }
        // Never send bearer credentials to an arbitrary URL returned by a provider.
        let next: URL;
        try {
          next = new URL(parsed.data.next);
        } catch {
          throw new ProviderError("invalid_response");
        }
        const nextOffset = Number(next.searchParams.get("offset"));
        if (
          next.origin !== first.origin ||
          next.pathname !== path ||
          next.username ||
          next.password ||
          !Number.isSafeInteger(nextOffset) ||
          nextOffset <= offset ||
          nextOffset % 30 !== 0
        )
          throw new ProviderError("invalid_response");
        if (nextOffset > 9999) {
          progress.next = undefined;
          progress.hasMore = false;
          progress.coverage = "provider_limit";
          break;
        }
        offset = nextOffset;
        progress.next = { offset };
      }
    },
  );

  const braveDefinition: SourceDefinition = {
    id: "brave",
    name: "Brave Search",
    operations: ["text"],
    lanes: ["legit", "reps"],
    region: "Global indexed pages",
    access: "licensed_search_index",
    timeoutMs: options.timeoutMs ?? 20000,
    maxPages: Math.min(options.maxPages ?? 3, 5),
    maxRequests: options.maxRequests ?? 6,
    maxConcurrent: 1,
    retention: "request_only",
  };
  const brave = adapter(
    braveDefinition,
    () => !!config.braveKey,
    async (input, budget, progress) => {
      const variants = queryVariants(parseIntent(input.query));
      const japanIds = ["mercari", "rakuma", "yahoo"];
      const sources = marketplaces.filter((m) => m.lanes.includes(input.lane));
      const groups =
        input.lane === "reps"
          ? [
              {
                markets: sources.filter(
                  (m) => !m.repsGroup || m.repsGroup === "marketplace",
                ),
                language: "zh",
                similar: false,
              },
              {
                markets: sources.filter((m) => m.repsGroup === "direct_shop"),
                language: "en",
                similar: true,
              },
              {
                markets: sources.filter((m) => m.repsGroup === "factory"),
                language: "en",
                similar: true,
              },
            ]
          : [
              {
                markets: sources.filter((m) => !japanIds.includes(m.id)),
                language: "en",
                similar: false,
              },
              {
                markets: sources.filter((m) => japanIds.includes(m.id)),
                language: "ja",
                similar: false,
              },
            ];
      const cursor = input.continuation?.sources.brave;
      const queue =
        cursor?.queue.map((entry) => ({ ...entry })) ??
        groups
          .map((group, groupId) => ({
            groupId,
            offset: 0,
            available: group.markets.length,
          }))
          .filter((entry) => entry.available)
          .map(({ groupId, offset }) => ({ groupId, offset }));
      let limited = cursor?.limited ?? false;
      let unknown = cursor?.unknown ?? false;
      progress.next = { queue, limited, unknown };
      while (queue.length && progress.pages < braveDefinition.maxPages) {
        const entry = queue[0];
        const group = { ...groups[entry.groupId], offset: entry.offset };
        if (!group.markets) throw new ProviderError("invalid_response");
        const query =
          (group.similar
            ? variants.find(
                (v) => v.reason === "Similar-design supplier search",
              )?.text
            : undefined) ??
          variants.find((v) => v.language === group.language)?.text ??
          input.query;
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set(
          "q",
          `${query} (${group.markets.map((m) => `site:${m.domain}`).join(" OR ")})`,
        );
        url.searchParams.set("count", "20");
        url.searchParams.set("offset", String(group.offset));
        const response = await transport.json(
          url.href,
          {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": config.braveKey,
            },
          },
          budget,
        );
        const parsed = braveEnvelope.safeParse(response);
        if (!parsed.success) throw new ProviderError("invalid_response");
        progress.pages++;
        for (const raw of parsed.data.web?.results ?? []) {
          const parsedItem = braveItem.safeParse(raw);
          if (!parsedItem.success) {
            progress.skipped++;
            continue;
          }
          const item = parsedItem.data;
          let identity;
          try {
            identity = identifyListingUrl(item.url);
          } catch {
            identity = null;
          }
          const market =
            identity && group.markets.find((m) => m.id === identity.sourceId);
          if (!identity || !market) {
            progress.skipped++;
            continue;
          }
          progress.listings.push(
            recordEvidence(
              {
                id: `${identity.sourceId}-${identity.itemId}`,
                sourceId: identity.sourceId,
                sourceItemId: identity.itemId,
                title: cleanText(item.title),
                platform: market.name,
                url: identity.canonicalUrl,
                price: null,
                currency: "XXX",
                shipping: null,
                size: "Not specified",
                condition: "Not specified",
                lane: input.lane,
                seller: "Seller evidence unavailable",
                evidence: { ...unknownEvidence },
                availability: "unknown",
                match: "related",
                source: "live",
                checkedAt: new Date(now()).toISOString(),
                notes: `Indexed ${market.repsGroup === "factory" ? "factory product candidate; minimum order, sample price and freight require verification" : "listing candidate"}; stock, price and seller history are unverified. ${cleanText(item.description ?? "").slice(0, 500)}`,
                authenticity:
                  input.lane === "reps"
                    ? market.repsGroup
                      ? "Similar-design supplier candidate · branding unverified"
                      : "Replica search candidate · classification unverified"
                    : "Resale search candidate · authenticity unverified",
              },
              "indexed_page",
            ),
          );
        }
        queue.shift();
        const more = parsed.data.query?.more_results_available;
        if (more === true && group.offset < 9)
          queue.push({ groupId: entry.groupId, offset: group.offset + 1 });
        else if (more === true) limited = true;
        else if (more !== false) unknown = true;
        progress.hasMore = queue.length > 0;
        progress.next = queue.length ? { queue, limited, unknown } : undefined;
        progress.coverage = queue.length
          ? "more"
          : limited
            ? "provider_limit"
            : unknown
              ? "unknown"
              : "exhausted";
      }
    },
  );
  return [
    ebay,
    brave,
    ...(config.publicSearch !== undefined
      ? [createPoshmarkAdapter(config.publicSearch, options)]
      : []),
  ];
}
