import test from "node:test";
import assert from "node:assert/strict";
import {
  createPoshmarkAdapter,
  parsePoshmarkPage,
  initialState,
} from "../lib/discovery/poshmark.ts";
import { createAdapters } from "../lib/discovery/providers.ts";
import { discover } from "../lib/discovery/search.ts";
import {
  cursorSchema,
  searchScope,
  type Continuation,
} from "../lib/discovery/pagination.ts";
import { deduplicateListings } from "../lib/listing-identity.ts";
import { mergeSearchRun } from "../lib/search-session.ts";

const input = { query: "Maison Margiela GAT sneakers", lane: "legit" as const };
const checkedAt = "2026-09-14T00:00:00Z";
const id = (n: number) => n.toString(16).padStart(24, "0");
function html(start: number, count: number, next: string | null, expanded = 0) {
  const data = Array.from({ length: count }, (_, n) => ({
    id: id(start + n),
    title: `Maison Margiela GAT ${start + n}`,
    description: 'Suede with "gum" sole and } braces',
    creator_username: "fixture-seller",
    price_amount: { val: "120.00", currency_code: "USD" },
    inventory: { status: "available" },
    size_obj: { display_with_size_system: "EU 42" },
    search_tracking_info: JSON.stringify({
      match_type: n >= count - expanded ? "latke" : "mash",
    }),
  }));
  return `<script>window.__INITIAL_STATE__ = ${JSON.stringify({ $_search: { gridData: { data, more: { next_max_id: next, is_next_max_id_present: !!next } } } })}; throw new Error('must never execute');</script><script type="application/ld+json">${JSON.stringify({ "@type": "ItemList", itemListElement: data.map((row) => ({ url: `https://poshmark.com/listing/Margiela-GAT-${row.id}` })) })}</script>`;
}
const config = {
  ebay: { clientId: "", clientSecret: "", accessToken: "fixture" },
  braveKey: "fixture",
};
const ebayItem = (n: number) => ({
  itemId: `v1|${123456789000 + n}|0`,
  title: "Margiela GAT",
  itemWebUrl: `https://www.ebay.com/itm/${123456789000 + n}`,
  price: { value: "100", currency: "USD" },
});

test("public pages return more than six, resume opaque cursor, and keep seller history unknown", async () => {
  const seen: string[] = [];
  const adapter = createPoshmarkAdapter(true, {
    fetch: async (url, init) => {
      const parsed = new URL(String(url));
      seen.push(parsed.searchParams.get("max_id") ?? "first");
      assert.equal(parsed.origin, "https://poshmark.com");
      assert.equal(parsed.pathname, "/search");
      assert.equal(init?.redirect, "manual");
      return new Response(
        seen.length === 1 ? html(1, 48, "ENC_next") : html(49, 48, null),
      );
    },
  });
  const first = await discover([adapter], input);
  const second = await discover([adapter], {
    ...input,
    continuation: first.continuation,
  });
  assert.equal(
    deduplicateListings([...first.listings, ...second.listings]).length,
    96,
  );
  assert.deepEqual(seen, ["first", "ENC_next"]);
  assert.equal(second.continuation, undefined);
  assert.equal(first.listings[0].provenance, "public_page");
  assert.equal(first.listings[0].evidence.sold, null);
  assert.equal(first.listings[0].shipping, null);
  assert.equal(first.listings[0].price, 120);
  assert.equal(mergeSearchRun(first.run!, second.run)?.sources[0].pages, 2);
});

test("Poshmark trims expanded recommendations and stops at keyword coverage boundary", () => {
  const mixed = parsePoshmarkPage(html(1, 48, "ENC_next", 41), checkedAt);
  assert.equal(mixed.listings.length, 7);
  assert.equal(mixed.coverage, "provider_limit");
  assert.equal(mixed.next, undefined);
  const expanded = parsePoshmarkPage(html(1, 48, "ENC_next", 48), checkedAt);
  assert.equal(expanded.listings.length, 0);
  assert.equal(expanded.coverage, "provider_limit");
  assert.throws(() => initialState("<html>Login required</html>"));
});

test("scope distinguishes cleared fields, query, lane, and image; rejects malformed cursors", async () => {
  const scope = await searchScope(input, {});
  assert.notEqual(scope, await searchScope(input, { brand: null }));
  assert.notEqual(
    scope,
    await searchScope({ ...input, imageBase64: "abcd" }, {}),
  );
  assert.notEqual(scope, await searchScope({ ...input, lane: "reps" }, {}));
  assert.notEqual(
    scope,
    await searchScope({ ...input, query: "Rick Owens" }, {}),
  );
  for (const sources of [
    { ebay: { offset: 1 } },
    { brave: { queue: [{ groupId: 0, offset: 10 }] } },
    { poshmark: { maxId: "https://evil.example" } },
    { poshmark: { maxId: "x".repeat(2049) } },
  ])
    assert.equal(
      cursorSchema.safeParse({ version: 1, scope, sources }).success,
      false,
    );
  await assert.rejects(
    discover([], {
      ...input,
      continuation: { version: 1, scope: "0".repeat(64), sources: {} },
    }),
  );
});

test("failed Poshmark page and cancellation retain the accepted checkpoint", async () => {
  let failed = true;
  const continuation: Continuation = {
    version: 1,
    scope: await searchScope(input, {}),
    sources: { poshmark: { maxId: "ENC_second" } },
  };
  const adapter = createPoshmarkAdapter(true, {
    sleep: async () => {},
    fetch: async (url) => {
      assert.equal(
        new URL(String(url)).searchParams.get("max_id"),
        "ENC_second",
      );
      return failed
        ? new Response("denied", { status: 403 })
        : new Response(html(49, 48, null));
    },
  });
  const failure = await discover([adapter], { ...input, continuation });
  assert.equal(failure.run?.sources[0].state, "access_denied");
  assert.deepEqual(failure.continuation, continuation);
  failed = false;
  assert.equal(
    (
      await discover([adapter], {
        ...input,
        continuation: failure.continuation,
      })
    ).listings.length,
    48,
  );
  const controller = new AbortController();
  controller.abort();
  const cancelled = await discover([adapter], {
    ...input,
    continuation,
    signal: controller.signal,
  });
  assert.equal(cancelled.listings.length, 0);
  assert.deepEqual(cancelled.continuation, continuation);
});

test("a repeated Poshmark cursor pauses without advancing or appending a partial page", async () => {
  const adapter = createPoshmarkAdapter(true, {
    fetch: async () => new Response(html(1, 48, "ENC_same")),
  });
  const result = await adapter.search({
    ...input,
    continuation: {
      version: 1,
      scope: "0".repeat(64),
      sources: { poshmark: { maxId: "ENC_same" } },
    },
  });
  assert.equal(result.status.state, "invalid_response");
  assert.equal(result.listings.length, 0);
  assert.deepEqual(result.status.next, { maxId: "ENC_same" });
});

test("public GAT search preserves another brand and rejects redirects without following them", async () => {
  let calls = 0;
  const adapter = createPoshmarkAdapter(true, {
    fetch: async (url, init) => {
      calls++;
      assert.equal(
        new URL(String(url)).searchParams.get("query"),
        "Adidas German Army Trainer",
      );
      assert.equal(init?.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://untrusted.example" },
      });
    },
  });
  assert.equal(
    (await adapter.search({ ...input, query: "Adidas German Army Trainer" }))
      .status.state,
    "unavailable",
  );
  assert.equal(calls, 1);
});

test("eBay resumes more than six offers across batches and does not restart a finished source", async () => {
  const offsets: number[] = [];
  const [ebay] = createAdapters(config, {
    maxPages: 1,
    fetch: async (url) => {
      const offset = Number(new URL(String(url)).searchParams.get("offset"));
      offsets.push(offset);
      return Response.json({
        itemSummaries: Array.from({ length: 30 }, (_, i) =>
          ebayItem(offset + i),
        ),
        ...(offset < 90
          ? {
              next: `https://api.ebay.com/buy/browse/v1/item_summary/search?offset=${offset + 30}`,
            }
          : {}),
      });
    },
  });
  let continuation: Continuation | undefined;
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const response = await discover([ebay], { ...input, continuation });
    rows.push(...response.listings);
    continuation = response.continuation;
  }
  assert.equal(deduplicateListings(rows).length, 120);
  assert.deepEqual(offsets, [0, 30, 60, 90]);
  assert.equal(continuation, undefined);
  const result = await ebay.search({
    ...input,
    continuation: { version: 1, scope: "0".repeat(64), sources: {} },
  });
  assert.equal(result.status.state, "not_requested");
  assert.equal(offsets.length, 4);
});

test("disabled/unsupported sources clear cursors and eBay ceiling stops instead of retrying forever", async () => {
  const [disabled] = createAdapters({
    ebay: { clientId: "", clientSecret: "" },
    braveKey: "",
  });
  const page = {
    ...input,
    continuation: {
      version: 1 as const,
      scope: "0".repeat(64),
      sources: { ebay: { offset: 30 } },
    },
  };
  const result = await disabled.search(page);
  assert.equal(result.status.next, undefined);
  assert.equal(result.status.coverage, "unknown");
  assert.equal(
    (await disabled.search({ ...page, lane: "reps" })).status.next,
    undefined,
  );
  const [ebay] = createAdapters(config, {
    fetch: async () =>
      Response.json({
        itemSummaries: [ebayItem(1)],
        next: "https://api.ebay.com/buy/browse/v1/item_summary/search?offset=10020",
      }),
  });
  const end = await ebay.search({
    ...page,
    continuation: { ...page.continuation, sources: { ebay: { offset: 9990 } } },
  });
  assert.equal(end.status.coverage, "provider_limit");
  assert.equal(end.status.next, undefined);
});

test("Brave failed group stays queued and resumes all Reps groups fairly", async () => {
  let fail = true;
  const requests: string[] = [];
  const [, brave] = createAdapters(config, {
    maxPages: 1,
    sleep: async () => {},
    fetch: async (url) => {
      const query = new URL(String(url)).searchParams.get("q")!;
      requests.push(query);
      if (fail) return new Response("denied", { status: 403 });
      return Response.json({
        query: { more_results_available: true },
        web: { results: [] },
      });
    },
  });
  const reps = { ...input, lane: "reps" as const };
  const failure = await discover([brave], reps);
  fail = false;
  const first = await discover([brave], {
    ...reps,
    continuation: failure.continuation,
  });
  assert.equal(requests[0], requests[1]);
  const second = await discover([brave], {
    ...reps,
    continuation: first.continuation,
  });
  await discover([brave], { ...reps, continuation: second.continuation });
  assert.equal(new Set(requests.slice(1)).size, 3);
  assert.ok(first.continuation); // Even zero new cards can have a next page.
});

test("Brave final permitted page and missing more flag never claim complete coverage", async () => {
  for (const more of [true, undefined]) {
    const [, brave] = createAdapters(config, {
      fetch: async () =>
        Response.json({
          query: { more_results_available: more },
          web: { results: [] },
        }),
    });
    const response = await discover([brave], {
      ...input,
      continuation: {
        version: 1,
        scope: await searchScope(input, {}),
        sources: { brave: { queue: [{ groupId: 0, offset: 9 }] } },
      },
    });
    assert.notEqual(response.run?.status, "complete");
    assert.equal(
      response.run?.sources[0].coverage,
      more ? "provider_limit" : "unknown",
    );
    assert.equal(response.continuation, undefined);
  }
});

test("page-specific eBay cache never replays the first page for a continuation", async () => {
  const seen: number[] = [];
  const [ebay] = createAdapters(
    { ...config, cache: { ebay: 60 } },
    {
      fetch: async (url) => {
        const offset = Number(new URL(String(url)).searchParams.get("offset"));
        seen.push(offset);
        return Response.json({ itemSummaries: [ebayItem(offset)] });
      },
    },
  );
  await ebay.search(input);
  const page = {
    ...input,
    continuation: {
      version: 1 as const,
      scope: "0".repeat(64),
      sources: { ebay: { offset: 30 } },
    },
  };
  const next = await ebay.search(page);
  assert.notEqual(next.listings[0].sourceItemId, `v1|123456789000|0`);
  assert.equal((await ebay.search(page)).status.fromCache, true);
  assert.deepEqual(seen, [0, 30]);
});
