import test from "node:test";
import assert from "node:assert/strict";
import { createAdapters, numeric } from "../lib/discovery/providers.ts";
import { createEbayTokenManager } from "../lib/discovery/ebay-auth.ts";
import {
  retryAfterMs,
  createTransport,
  Semaphore,
  sleep,
} from "../lib/discovery/transport.ts";
import { discover } from "../lib/discovery/search.ts";
import type { RuntimeOptions } from "../lib/discovery/types.ts";

const json = (value: unknown, status = 200, headers = {}) =>
  Response.json(value, { status, headers });
const config = {
  ebay: { clientId: "", clientSecret: "", accessToken: "fixture-token" },
  braveKey: "fixture-key",
};
const managed = { clientId: "fixture-id", clientSecret: "fixture-secret" };
const input = {
  query: "Rick Owens bias bootcut jeans degrade",
  lane: "legit" as const,
};
const item = (overrides = {}) => ({
  itemId: "v1|227343221934|0",
  title: "Rick Owens bias bootcut jeans degrade W34",
  itemWebUrl: "https://www.ebay.com/itm/227343221934",
  price: { value: "500.00", currency: "USD" },
  seller: {
    username: "fixture-seller",
    feedbackScore: -2,
    feedbackPercentage: "99.5",
  },
  ...overrides,
});
const runtime = (
  fetcher: RuntimeOptions["fetch"],
  extra: RuntimeOptions = {},
): RuntimeOptions => ({
  fetch: fetcher,
  sleep: async () => {},
  random: () => 0,
  ...extra,
});
const signal = () => new AbortController().signal;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("numeric parsing preserves unknown and signed feedback", () => {
  for (const bad of [
    null,
    undefined,
    true,
    false,
    [],
    {},
    "",
    " ",
    "NaN",
    Infinity,
    "1e4",
  ])
    assert.equal(numeric(bad), null);
  assert.equal(numeric("0"), 0);
  assert.equal(numeric("-2", true), -2);
  assert.equal(numeric(-2), null);
});
test("eBay metrics have separate meanings, raw values and expiry", async () => {
  const [ebay] = createAdapters(
    config,
    runtime(async () => json({ itemSummaries: [item()] })),
  );
  const result = await ebay.search(input);
  const l = result.listings[0];
  assert.equal(result.status.state, "ok");
  assert.equal(l.evidence.feedbackScore, -2);
  assert.equal(l.evidence.reviews, null);
  assert.equal(l.evidence.sold, null);
  assert.equal(l.evidence.positiveRate, 0.995);
  assert.equal(l.provenance, "live_api");
  assert.ok(Date.parse(l.expiresAt!) > Date.parse(l.observedAt!));
  assert.equal(
    l.observations!.find((o) => o.field === "positiveRate")!.rawValue,
    "99.5",
  );
  assert.equal(
    l.observations!.find((o) => o.field === "reviews")!.unknownReason,
    "not_supported",
  );
});
test("malformed rows retain healthy rows and invalid values remain inspectable", async () => {
  const [ebay] = createAdapters(
    config,
    runtime(async () =>
      json({
        itemSummaries: [
          null,
          item({
            price: { value: true, currency: "made-up" },
            seller: { feedbackScore: "oops", feedbackPercentage: "101" },
          }),
        ],
      }),
    ),
  );
  const result = await ebay.search(input);
  const l = result.listings[0];
  assert.equal(result.status.state, "partial");
  assert.equal(result.status.skipped, 1);
  assert.equal(l.price, null);
  assert.equal(l.currency, "XXX");
  assert.equal(l.evidence.feedbackScore, null);
  assert.equal(
    l.observations!.find((o) => o.field === "feedbackScore")!.rawValue,
    "oops",
  );
  assert.equal(
    l.observations!.find((o) => o.field === "positiveRate")!.unknownReason,
    "invalid",
  );
});
test("malformed envelope is a source error, not an empty result", async () => {
  const [ebay] = createAdapters(
    config,
    runtime(async () => json({ unexpected: [] })),
  );
  assert.equal((await ebay.search(input)).status.state, "invalid_response");
});
test("healthy eBay results survive Brave failure without leaking errors or falling back", async () => {
  const adapters = createAdapters(
    config,
    runtime(async (url) =>
      new URL(String(url)).hostname === "api.ebay.com"
        ? json({ itemSummaries: [item()] })
        : json({ error: "SECRET-provider-error" }, 403),
    ),
  );
  const result = await discover(adapters, input);
  assert.equal(result.listings.length, 1);
  assert.equal(result.run!.status, "partial");
  assert.equal(result.run!.sources[1].state, "access_denied");
  assert.ok(!JSON.stringify(result).includes("SECRET"));
});
test("unconfigured and empty searches never inherit reference snapshots", async () => {
  const adapters = createAdapters({
    ebay: { clientId: "", clientSecret: "" },
    braveKey: "",
  });
  const result = await discover(adapters, input);
  assert.equal(result.listings.length, 0);
  assert.equal(result.mode, "links");
  assert.ok(result.run!.sources.every((s) => s.state === "not_configured"));
  const [ebay] = createAdapters(
    config,
    runtime(async () => json({ total: 0 })),
  );
  assert.equal((await ebay.search(input)).status.state, "empty");
});
test("token mint is coalesced for 20 callers and renewed before expiry", async () => {
  let calls = 0,
    now = 0;
  const manager = createEbayTokenManager(
    managed,
    runtime(
      async (_url, init) => {
        calls++;
        assert.equal(init!.method, "POST");
        assert.ok(String(init!.body).includes("grant_type=client_credentials"));
        return json({ access_token: `token-${calls}`, expires_in: 100 });
      },
      { now: () => now },
    ),
  );
  const tokens = await Promise.all(
    Array.from({ length: 20 }, () => manager.get(signal())),
  );
  assert.equal(calls, 1);
  assert.ok(tokens.every((token) => token.value === "token-1"));
  now = 91000;
  assert.equal((await manager.get(signal())).value, "token-2");
  manager.invalidate("token-1");
  await manager.get(signal());
  assert.equal(calls, 2);
});
test("cancelling the first token waiter does not cancel other callers", async () => {
  let resolve!: (response: Response) => void;
  const manager = createEbayTokenManager(
    managed,
    runtime(
      async () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const controller = new AbortController();
  const first = manager.get(controller.signal);
  const rejected = assert.rejects(first, { code: "cancelled" });
  const second = manager.get(signal());
  controller.abort();
  resolve(json({ access_token: "shared", expires_in: 7200 }));
  await rejected;
  assert.equal((await second).value, "shared");
});
test("failed token acquisition clears the shared promise for recovery", async () => {
  let calls = 0;
  const manager = createEbayTokenManager(
    managed,
    runtime(async () =>
      ++calls === 1
        ? json({}, 401)
        : json({ access_token: "recovered", expires_in: 7200 }),
    ),
  );
  await assert.rejects(manager.get(signal()), { code: "auth_error" });
  assert.equal((await manager.get(signal())).value, "recovered");
});
test("expired managed token recovers once and repeated 401 never loops", async () => {
  for (const recover of [true, false]) {
    let mints = 0,
      searches = 0;
    const [ebay] = createAdapters(
      { ...config, ebay: managed },
      runtime(async (url) => {
        if (String(url).includes("oauth2"))
          return json({ access_token: `token-${++mints}`, expires_in: 7200 });
        searches++;
        return searches === 1 || !recover
          ? json({}, 401)
          : json({ itemSummaries: [item()] });
      }),
    );
    assert.equal(
      (await ebay.search(input)).status.state,
      recover ? "ok" : "auth_error",
    );
    assert.equal(searches, 2);
    assert.equal(mints, 2);
  }
});
test("403 and legacy-token 401 are not retried", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const [ebay] = createAdapters(
      config,
      runtime(async () => {
        calls++;
        return json({}, status);
      }),
    );
    assert.equal(
      (await ebay.search(input)).status.state,
      status === 401 ? "auth_error" : "access_denied",
    );
    assert.equal(calls, 1);
  }
});
test("eBay follows item offsets, bounds pages and preserves more-results status", async () => {
  const offsets: string[] = [];
  const [ebay] = createAdapters(
    config,
    runtime(
      async (url) => {
        const offset = new URL(String(url)).searchParams.get("offset")!;
        offsets.push(offset);
        return json({
          itemSummaries: [item()],
          next: `https://api.ebay.com/buy/browse/v1/item_summary/search?offset=${Number(offset) + 30}`,
        });
      },
      { maxPages: 2 },
    ),
  );
  const result = await ebay.search(input);
  assert.deepEqual(offsets, ["0", "30"]);
  assert.equal(result.status.state, "partial");
  assert.equal(result.status.hasMore, true);
});
test("untrusted pagination links never receive bearer credentials", async () => {
  let calls = 0;
  const [ebay] = createAdapters(
    config,
    runtime(async () => {
      calls++;
      return json({
        itemSummaries: [item()],
        next: "https://untrusted.example/search?offset=30",
      });
    }),
  );
  const result = await ebay.search(input);
  assert.equal(calls, 1);
  assert.equal(result.status.errorCode, "invalid_response");
  assert.equal(result.listings.length, 1);
});
test("Brave uses page indexes and excludes category pages", async () => {
  const offsets: string[] = [];
  const [, brave] = createAdapters(
    config,
    runtime(
      async (url) => {
        const offset = new URL(String(url)).searchParams.get("offset")!;
        offsets.push(offset);
        return json({
          query: { more_results_available: offset === "0" },
          web: {
            results: [
              {
                title: "Rick Owens jeans",
                url: "https://item.taobao.com/item.htm?id=1234",
              },
              {
                title: "search page",
                url: "https://s.taobao.com/search?q=jeans",
              },
            ],
          },
        });
      },
      { maxPages: 5 },
    ),
  );
  const result = await discover([brave], { ...input, lane: "reps" });
  assert.deepEqual(offsets, ["0", "0", "0", "1", "1"]);
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].price, null);
  assert.equal(result.listings[0].availability, "unknown");
  assert.equal(result.listings[0].provenance, "indexed_page");
});
test("Brave allocates first pages to English and Japanese source groups", async () => {
  const queries: string[] = [];
  const [, brave] = createAdapters(
    config,
    runtime(async (url) => {
      queries.push(new URL(String(url)).searchParams.get("q")!);
      return json({
        query: { more_results_available: false },
        web: { results: [] },
      });
    }),
  );
  await brave.search(input);
  assert.equal(queries.length, 2);
  assert.ok(queries[0].includes("site:grailed.com"));
  assert.ok(queries[1].includes("リックオウエンス"));
});
test("photo search sends raw base64 only to eBay and marks Brave inapplicable", async () => {
  let calls = 0;
  const result = await discover(
    createAdapters(
      config,
      runtime(async (url, init) => {
        calls++;
        assert.ok(String(url).includes("search_by_image"));
        assert.equal(init!.method, "POST");
        assert.deepEqual(JSON.parse(String(init!.body)), { image: "aGVsbG8=" });
        return json({ total: 0 });
      }),
    ),
    { ...input, imageBase64: "aGVsbG8=" },
  );
  assert.equal(calls, 1);
  assert.equal(result.run!.sources[1].state, "not_applicable");
});
test("Retry-After and Brave paired windows use bounded relative seconds", () => {
  assert.equal(retryAfterMs(new Headers({ "Retry-After": "2" }), 0), 2000);
  assert.equal(
    retryAfterMs(
      new Headers({ "Retry-After": new Date(5000).toUTCString() }),
      1000,
    ),
    4000,
  );
  assert.equal(
    retryAfterMs(
      new Headers({
        "x-ratelimit-limit": "1,1000",
        "x-ratelimit-remaining": "0,900",
        "x-ratelimit-reset": "1,600",
      }),
      0,
    ),
    1000,
  );
  assert.equal(
    retryAfterMs(
      new Headers({
        "x-ratelimit-limit": "0,1000",
        "x-ratelimit-remaining": "0,0",
        "x-ratelimit-reset": "900,2",
      }),
      0,
    ),
    2000,
  );
});
test("429 retries once if within budget and large reset enters source cooldown", async () => {
  let calls = 0;
  const delays: number[] = [];
  const [ebay] = createAdapters(
    config,
    runtime(
      async () =>
        ++calls === 1
          ? json({}, 429, { "Retry-After": "1" })
          : json({ total: 0 }),
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    ),
  );
  assert.equal((await ebay.search(input)).status.state, "empty");
  assert.deepEqual(delays, [1000]);
  let blockedCalls = 0;
  const [blocked] = createAdapters(
    config,
    runtime(async () => {
      blockedCalls++;
      return json({}, 429, { "Retry-After": "600" });
    }),
  );
  assert.equal((await blocked.search(input)).status.state, "rate_limited");
  assert.equal((await blocked.search(input)).status.state, "rate_limited");
  assert.equal(blockedCalls, 1);
});
test("request budget includes retries and prevents additional page requests", async () => {
  let calls = 0;
  const [ebay] = createAdapters(
    config,
    runtime(
      async () => {
        calls++;
        return json({}, 500);
      },
      { maxRequests: 1 },
    ),
  );
  await ebay.search(input);
  assert.equal(calls, 1);
});
test("repeated failures open circuit, which recovers after cooldown", async () => {
  let calls = 0,
    now = 0,
    healthy = false;
  const [ebay] = createAdapters(
    config,
    runtime(
      async () => {
        calls++;
        return healthy ? json({ total: 0 }) : json({ error: "secret" }, 500);
      },
      { now: () => now },
    ),
  );
  for (let i = 0; i < 3; i++) await ebay.search(input);
  assert.equal((await ebay.search(input)).status.state, "circuit_open");
  assert.equal(calls, 6);
  now = 31000;
  healthy = true;
  assert.equal((await ebay.search(input)).status.state, "empty");
});
test("caching defaults off and opt-in cache preserves observation times", async () => {
  for (const approved of [false, true]) {
    let calls = 0,
      now = 0;
    const [ebay] = createAdapters(
      { ...config, cache: approved ? { ebay: 30 } : undefined },
      runtime(
        async () => {
          calls++;
          return json({ itemSummaries: [item()] });
        },
        { now: () => now },
      ),
    );
    const first = await ebay.search(input);
    now = 1000;
    const second = await ebay.search(input);
    assert.equal(calls, approved ? 1 : 2);
    assert.equal(second.status.fromCache, approved);
    if (approved)
      assert.equal(first.listings[0].observedAt, second.listings[0].observedAt);
    now = 31000;
    await ebay.search(input);
    assert.equal(calls, approved ? 2 : 3);
  }
});
test("queued cancellation releases no extra permits and release is idempotent", async () => {
  const semaphore = new Semaphore(1);
  const release = await semaphore.acquire(signal());
  const controller = new AbortController();
  const pending = semaphore.acquire(controller.signal);
  const rejected = assert.rejects(pending, { code: "cancelled" });
  controller.abort();
  await rejected;
  let acquired = false;
  const next = semaphore.acquire(signal()).then((r) => {
    acquired = true;
    return r;
  });
  await tick();
  assert.equal(acquired, false);
  release();
  release();
  (await next)();
  (await semaphore.acquire(signal()))();
});
test("cancellation interrupts stalled fetch and body reads", async () => {
  for (const bodyStall of [false, true]) {
    const controller = new AbortController();
    const transport = createTransport(
      runtime(async () =>
        bodyStall
          ? new Response(new ReadableStream({ start() {} }))
          : new Promise<Response>(() => {}),
      ),
    );
    const pending = transport.json(
      "https://fixture.invalid",
      {},
      {
        requests: 0,
        maxRequests: 2,
        deadlineAt: Date.now() + 10000,
        signal: controller.signal,
      },
    );
    const rejected = assert.rejects(pending, { code: "cancelled" });
    await tick();
    controller.abort();
    await rejected;
  }
});
test("timeout returns a controlled source state", async () => {
  const [ebay] = createAdapters(
    config,
    runtime(async () => new Promise<Response>(() => {}), { timeoutMs: 20 }),
  );
  // AbortSignal.timeout uses an unref timer in Node; keep the test process alive until it fires.
  const keepalive = setTimeout(() => {}, 200);
  try {
    assert.equal((await ebay.search(input)).status.state, "timeout");
  } finally {
    clearTimeout(keepalive);
  }
});
test("cancellation interrupts retry backoff", async () => {
  const controller = new AbortController();
  const pending = sleep(10000, controller.signal);
  const rejected = assert.rejects(pending, { code: "cancelled" });
  controller.abort();
  await rejected;
});
