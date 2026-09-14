import { z } from "zod";
import { unknownEvidence, type Listing } from "../finder-types.ts";
import { recordEvidence } from "../evidence.ts";
import { identifyListingUrl } from "../listing-identity.ts";
import { isGatQuery } from "../item-intent.ts";
import {
  createTransport,
  ProviderError,
  Semaphore,
  abortError,
} from "./transport.ts";
import {
  sourceMessages,
  type SearchAdapter,
  type RuntimeOptions,
  type SourceState,
} from "./types.ts";
import {
  cursorSchema,
  type SourceCursors,
  type Coverage,
} from "./pagination.ts";

const envelope = z.object({
  $_search: z.object({
    gridData: z.object({
      data: z.array(z.unknown()).max(500),
      more: z
        .object({
          total: z.number().nonnegative().optional(),
          next_max_id: z.string().nullable().optional(),
          is_next_max_id_present: z.boolean().optional(),
        })
        .passthrough()
        .optional(),
    }),
  }),
});
const itemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
  title: z.string().min(1).max(1000),
  search_tracking_info: z.string().optional(),
  description: z.string().optional(),
  creator_username: z.string().optional(),
  price_amount: z
    .object({
      val: z.union([z.string(), z.number()]),
      currency_code: z.string(),
    })
    .optional(),
  inventory: z
    .object({ status: z.string().optional() })
    .passthrough()
    .optional(),
  size_obj: z
    .object({ display_with_size_system: z.string().optional() })
    .passthrough()
    .optional(),
  cover_shot: z
    .object({ url_large: z.string().optional() })
    .passthrough()
    .optional(),
  picture_url: z.string().optional(),
});
const clean = (text: string) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const currencies = new Set(Intl.supportedValuesOf("currency"));

/** Extract the JSON object only. Never execute marketplace scripts. */
export function initialState(html: string): unknown {
  const marker = /window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!marker) throw new ProviderError("invalid_response");
  const start = marker.index + marker[0].length;
  if (html[start] !== "{") throw new ProviderError("invalid_response");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        throw new ProviderError("invalid_response");
      }
    }
  }
  throw new ProviderError("invalid_response");
}

export function parsePoshmarkPage(html: string, checkedAt: string) {
  const parsed = envelope.safeParse(initialState(html));
  if (!parsed.success) throw new ProviderError("invalid_response");
  const grid = parsed.data.$_search.gridData;
  const urls = new Map<string, string>();
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(match[1]);
      if (data["@type"] !== "ItemList" || !Array.isArray(data.itemListElement))
        continue;
      for (const entry of data.itemListElement) {
        if (typeof entry.url !== "string") continue;
        const identity = identifyListingUrl(entry.url);
        if (identity?.sourceId === "poshmark")
          urls.set(identity.itemId, identity.canonicalUrl);
      }
    } catch {
      /* An unrelated structured-data block is not a listing. */
    }
  }
  const listings: Listing[] = [];
  let skipped = 0,
    expanded = false;
  for (const raw of grid.data) {
    const result = itemSchema.safeParse(raw);
    if (!result.success || !urls.has(result.data.id)) {
      skipped++;
      continue;
    }
    const item = result.data;
    try {
      if (
        item.search_tracking_info &&
        JSON.parse(item.search_tracking_info).match_type === "latke"
      ) {
        expanded = true;
        skipped++;
        continue;
      }
    } catch {}
    const currency = currencies.has(item.price_amount?.currency_code ?? "")
      ? item.price_amount!.currency_code
      : "XXX";
    const rawPrice = item.price_amount?.val;
    const price =
      rawPrice !== undefined &&
      /^\d+(?:\.\d+)?$/.test(String(rawPrice)) &&
      Number.isFinite(Number(rawPrice))
        ? Number(rawPrice)
        : null;
    let image: string | undefined;
    try {
      const url = new URL(item.cover_shot?.url_large ?? item.picture_url ?? "");
      if (url.protocol === "https:" && !url.username && !url.password)
        image = url.href;
    } catch {}
    listings.push(
      recordEvidence(
        {
          id: `poshmark-${item.id}`,
          sourceId: "poshmark",
          sourceItemId: item.id,
          title: clean(item.title),
          platform: "Poshmark",
          url: urls.get(item.id)!,
          image,
          price: currency === "XXX" ? null : price,
          currency,
          shipping: null,
          size: item.size_obj?.display_with_size_system ?? "Not specified",
          condition: "See seller description",
          lane: "legit",
          seller: item.creator_username ?? "Seller unknown",
          evidence: { ...unknownEvidence },
          availability:
            item.inventory?.status === "available"
              ? "available"
              : item.inventory?.status === "sold_out"
                ? "sold-out"
                : "unknown",
          match: "related",
          source: "live",
          checkedAt,
          notes: `Observed on Poshmark's public search page. Shipping and seller history were not provided. ${clean(item.description ?? "").slice(0, 600)}`,
          authenticity: "Seller's resale claim · authenticity unverified",
        },
        "public_page",
      ),
    );
  }
  if (grid.data.length && !listings.length && !expanded)
    throw new ProviderError("invalid_response");
  const rawNext = grid.more?.next_max_id;
  let next: SourceCursors["poshmark"];
  if (!expanded && rawNext && grid.more?.is_next_max_id_present !== false) {
    const valid = cursorSchema.shape.sources.shape.poshmark.safeParse({
      maxId: rawNext,
    });
    if (!valid.success) throw new ProviderError("invalid_response");
    next = valid.data;
  }
  return {
    listings,
    skipped,
    next,
    total: grid.more?.total,
    coverage: (expanded
      ? "provider_limit"
      : next
        ? "more"
        : grid.more?.is_next_max_id_present === false || rawNext === null
          ? "exhausted"
          : "unknown") as Coverage,
  };
}

export function createPoshmarkAdapter(
  enabled: boolean,
  options: RuntimeOptions = {},
): SearchAdapter {
  const transport = createTransport(options);
  const slots = new Semaphore(1);
  let rateUntil = 0;
  return {
    definition: {
      id: "poshmark",
      name: "Poshmark public search",
      operations: ["text"],
      lanes: ["legit"],
      region: "US",
      access: "public_page",
      timeoutMs: options.timeoutMs ?? 20000,
      maxPages: 1,
      maxRequests: 2,
      maxConcurrent: 1,
      retention: "request_only",
    },
    configured: () => enabled,
    async search(input) {
      const started = transport.now();
      const signal = AbortSignal.any([
        AbortSignal.timeout(options.timeoutMs ?? 20000),
        ...(input.signal ? [input.signal] : []),
      ]);
      const budget = {
        requests: 0,
        maxRequests: 2,
        deadlineAt: started + (options.timeoutMs ?? 20000),
        signal,
      };
      let next: SourceCursors["poshmark"] =
        input.continuation?.sources.poshmark ?? {};
      let listings: Listing[] = [],
        pages = 0,
        skipped = 0,
        coverage: Coverage = "unknown";
      const result = (state: SourceState, error?: ProviderError) => ({
        listings,
        status: {
          id: "poshmark" as const,
          name: "Poshmark public search",
          state,
          message:
            coverage === "provider_limit"
              ? "Reached the end of keyword matches. Broader recommendations were excluded."
              : sourceMessages[state],
          count: listings.length,
          requests: budget.requests,
          pages,
          skipped,
          hasMore: !!next,
          next,
          coverage,
          fromCache: false,
          startedAt: new Date(started).toISOString(),
          finishedAt: new Date(transport.now()).toISOString(),
          elapsedMs: transport.now() - started,
          ...(error
            ? { errorCode: error.code, retryAfterMs: error.retryAfterMs }
            : {}),
        },
      });
      if (input.lane !== "legit" || input.imageBase64) {
        next = undefined;
        return result("not_applicable");
      }
      if (!enabled) {
        next = undefined;
        return result("not_configured");
      }
      if (input.continuation && !input.continuation.sources.poshmark) {
        next = undefined;
        return result("not_requested");
      }
      let release: (() => void) | undefined;
      try {
        release = await slots.acquire(signal);
        if (rateUntil > transport.now())
          throw new ProviderError("rate_limited", rateUntil - transport.now());
        const url = new URL("https://poshmark.com/search");
        // Search the model broadly, then rank colour/size variants against the submitted target.
        url.searchParams.set(
          "query",
          isGatQuery(input.query) && /margiela/i.test(input.query)
            ? "maison margiela gat"
            : input.query,
        );
        url.searchParams.set("type", "listings");
        url.searchParams.set("src", "dir");
        if (next?.maxId) url.searchParams.set("max_id", next.maxId);
        const html = await transport.text(
          url.href,
          { headers: { Accept: "text/html" } },
          budget,
        );
        const page = parsePoshmarkPage(
          html,
          new Date(transport.now()).toISOString(),
        );
        if (page.next?.maxId && page.next.maxId === next?.maxId)
          throw new ProviderError("invalid_response");
        listings = page.listings;
        skipped = page.skipped;
        next = page.next;
        coverage = page.coverage;
        pages = 1;
        return result(
          next || skipped ? "partial" : listings.length ? "ok" : "empty",
        );
      } catch (error) {
        const safe = signal.aborted
          ? abortError(signal)
          : error instanceof ProviderError
            ? error
            : new ProviderError("unavailable");
        coverage = "blocked";
        if (safe.code === "rate_limited")
          rateUntil = transport.now() + (safe.retryAfterMs ?? 1000);
        return result(safe.code, safe);
      } finally {
        release?.();
      }
    },
  };
}
