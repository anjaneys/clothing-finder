import test from "node:test";
import assert from "node:assert/strict";
import {
  gatDemo,
  gatLeads,
  leadsForQuery,
  filterLeads,
  minimumGoodsCost,
} from "../lib/sourcing-leads.ts";
import { isGatQuery, parseIntent, queryVariants } from "../lib/item-intent.ts";
import { identifyListingUrl } from "../lib/listing-identity.ts";
import { createAdapters } from "../lib/discovery/providers.ts";
import { discover } from "../lib/discovery/search.ts";
import { marketplaces, searchQuery } from "../lib/marketplaces.ts";

test("GAT aliases recognize the user's spelling and don't match unrelated Replica items", () => {
  for (const q of [
    "margella gats",
    "Margiela GAT",
    "Maison Margiela Replica sneakers",
    "German Army Trainer",
    "German trainers",
    "德训鞋",
    "ジャーマントレーナー",
  ])
    assert.equal(isGatQuery(q), true, q);
  assert.equal(parseIntent("margella gats").fields.brand, "Maison Margiela");
  assert.equal(parseIntent("margella gats").fields.category, "Sneakers");
  assert.equal(isGatQuery("Maison Margiela Replica fragrance"), false);
  assert.equal(isGatQuery("Maison Margiela replica Tabi sneakers"), false);
  assert.equal(
    leadsForQuery("Maison Margiela Replica Fusion sneakers").length,
    0,
  );
  assert.equal(isGatQuery("Rick Owens bias bootcut jeans"), false);
});

test("supplier handoffs use design terms while Chinese marketplaces use Chinese GAT terms", () => {
  assert.ok(
    searchQuery(
      gatDemo.query,
      "reps",
      marketplaces.find((m) => m.id === "maden"),
    ).startsWith("German army trainer"),
  );
  assert.ok(
    searchQuery(
      gatDemo.query,
      "reps",
      marketplaces.find((m) => m.id === "bona"),
    ).startsWith("German army trainer"),
  );
  assert.ok(
    searchQuery(
      gatDemo.query,
      "reps",
      marketplaces.find((m) => m.id === "taobao"),
    ).includes("德训鞋"),
  );
  assert.equal(searchQuery(gatDemo.query, "legit"), gatDemo.query);
});
test("GAT suppliers never appear for an unrelated target", () => {
  assert.equal(leadsForQuery("Rick Owens jeans").length, 0);
  assert.equal(leadsForQuery(gatDemo.query).length, 7);
});
test("one-pair filter excludes bulk factories and unconfirmed replica leads", () => {
  const one = filterLeads(gatLeads, "single", "all");
  assert.equal(one.length, 2);
  assert.ok(one.every((l) => l.minimumOrder === 1 && l.kind === "independent"));
  assert.equal(filterLeads(gatLeads, "factory", "Japan").length, 0);
  assert.equal(filterLeads(gatLeads, "all", "China").length, 6);
});
test("minimum goods costs respect MOQ and unknowns without converting currency", () => {
  assert.equal(
    minimumGoodsCost(gatLeads.find((l) => l.id === "huajin-german-trainer")!),
    2300,
  );
  assert.equal(
    minimumGoodsCost(gatLeads.find((l) => l.id === "huangxuan-hxca237")!),
    null,
  );
  const japan = gatLeads.find((l) => l.id === "novesta-white-ecru")!;
  assert.equal(minimumGoodsCost(japan), 36300);
  assert.equal(japan.currency, "JPY");
});
test("blocked replica leads cannot masquerade as priced, checked offers", () => {
  const replicas = filterLeads(gatLeads, "replica_lead", "all");
  for (const lead of replicas) {
    assert.equal(lead.unitPrice, null);
    assert.equal(lead.minimumOrder, null);
    assert.equal(lead.access, "community_only");
  }
});
test("GAT queries use footwear terms and preserve shoe size systems and official code", () => {
  const variants = queryVariants(parseIntent(gatDemo.query));
  assert.ok(
    variants.some((v) => v.language === "zh" && v.text.includes("德训鞋")),
  );
  assert.ok(
    variants.some(
      (v) => v.language === "ja" && v.text.includes("ジャーマントレーナー"),
    ),
  );
  assert.ok(!variants.some((v) => /jeans|牛仔|デニム/.test(v.text)));
  assert.equal(parseIntent("Margiela GAT EU 42").fields.size, "EU 42");
  assert.equal(parseIntent("Margiela GAT EU42").fields.size, "EU 42");
  assert.equal(parseIntent("Margiela GAT US 9.5").fields.size, "US 9.5");
  assert.equal(
    parseIntent("Margiela S57WS0236P1895101 sneakers").fields.styleCode,
    "S57WS0236P1895101",
  );
});
test("direct product IDs exclude shop homepages and category pages", () => {
  for (const id of [
    "maden-md2401038",
    "novesta-white-ecru",
    "huajin-german-trainer",
    "bona-mesh-german-trainer",
    "huangxuan-hxca237",
  ]) {
    assert.ok(identifyListingUrl(gatLeads.find((l) => l.id === id)!.url), id);
  }
  for (const url of [
    "https://maden365.com/collections/shoes",
    "https://novesta.jp/en/pages/legal-notice",
    "https://bonashoes.com/product-catalog/",
    "https://www.made-in-china.com/showroom/16cd2ba48b79eb3d/",
    "https://mychonly.com/oem-shoes/",
  ])
    assert.equal(identifyListingUrl(url), null);
});

test("direct shop variants keep their identity across locale and tracking copies", () => {
  for (const domain of ["novesta.jp", "maden365.com"]) {
    const base = `https://${domain}/products/german-trainer`;
    const first = identifyListingUrl(`${base}?variant=123`)!;
    const second = identifyListingUrl(`${base}?variant=456`)!;
    const translated = identifyListingUrl(
      `https://${domain}/en/products/german-trainer?variant=123&utm_source=test`,
    )!;
    assert.notEqual(first.itemId, second.itemId);
    assert.equal(first.itemId, translated.itemId);
    assert.notEqual(first.itemId, identifyListingUrl(base)!.itemId);
  }
});
test("reps discovery allocates a first page to marketplace, direct shop and factory groups", async () => {
  const queries: string[] = [];
  const [, brave] = createAdapters(
    { ebay: { clientId: "", clientSecret: "" }, braveKey: "fixture" },
    {
      fetch: async (url) => {
        const q = new URL(String(url)).searchParams.get("q")!;
        queries.push(q);
        const lead = q.includes("site:maden365.com")
          ? gatLeads[0]
          : q.includes("site:bonashoes.com")
            ? gatLeads[4]
            : gatLeads[2];
        return Response.json({
          query: { more_results_available: false },
          web: { results: [{ title: lead.title, url: lead.url }] },
        });
      },
    },
  );
  const result = await discover([brave], {
    query: gatDemo.query,
    lane: "reps",
  });
  assert.equal(queries.length, 3);
  assert.ok(queries[0].includes("德训鞋"));
  assert.ok(queries[1].startsWith("German army trainer"));
  assert.ok(queries[2].includes("site:bonashoes.com"));
  assert.equal(result.listings.length, 3);
  assert.ok(result.listings.every((l) => l.price === null));
  assert.ok(
    result.listings
      .find((l) => l.platform === "Bona Shoes")!
      .notes.includes("minimum order"),
  );
});

test("eBay shoe sizes never receive a jeans waist prefix", async () => {
  const [ebay] = createAdapters(
    {
      ebay: { clientId: "", clientSecret: "", accessToken: "fixture" },
      braveKey: "",
    },
    {
      fetch: async () =>
        Response.json({
          itemSummaries: [
            {
              itemId: "v1|227343221934|0",
              title: "Margiela GAT EU42",
              itemWebUrl: "https://www.ebay.com/itm/227343221934",
            },
          ],
        }),
    },
  );
  assert.equal(
    (await ebay.search({ query: "Margiela GAT", lane: "legit" })).listings[0]
      .size,
    "EU 42",
  );
});
