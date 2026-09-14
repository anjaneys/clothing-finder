import test from "node:test";
import assert from "node:assert/strict";
import { parseIntent, assessMatch, queryVariants } from "../lib/item-intent.ts";
import {
  identifyListingUrl,
  deduplicateListings,
} from "../lib/listing-identity.ts";
import {
  recordEvidence,
  applySellerCorrection,
  freshness,
  correctionFrom,
  withSellerCorrection,
} from "../lib/evidence.ts";
import { unknownEvidence, type Listing } from "../lib/finder-types.ts";
import { scoreSeller } from "../lib/scoring.ts";
const listing = (title: string): Listing => ({
  id: "fixture",
  title,
  platform: "eBay",
  url: "https://www.ebay.com/itm/227343221934",
  price: 500,
  currency: "USD",
  shipping: null,
  size: "W34",
  condition: "Used",
  lane: "legit",
  seller: "fixture",
  evidence: { ...unknownEvidence },
  availability: "available",
  match: "related",
  source: "live",
  checkedAt: "2026-09-13T00:00:00Z",
  notes: "",
  authenticity: "Unverified",
});

test("alias parsing, user overrides and explicit unknowns", () => {
  const target = parseIntent("rick owns bias bootcut jeans degrade W34");
  assert.equal(target.fields.brand, "Rick Owens");
  assert.equal(target.fields.model, "Bias Bootcut");
  assert.equal(target.fields.size, "34");
  assert.equal(parseIntent(target.query, { brand: null }).fields.brand, null);
  assert.equal(
    parseIntent(target.query, { finish: "Wax" }).origins.finish,
    "user_confirmed",
  );
});
test("degrade and wax are distinct variants", () => {
  const result = assessMatch(
    parseIntent("Rick Owens bias bootcut jeans degrade"),
    listing("Rick Owens bias bootcut jeans black wax"),
  );
  assert.equal(result.kind, "variant_mismatch");
  assert.ok(result.reasons.some((r) => r.includes("finish")));
});
test("full style-code suffix prevents wrong-color code matches", () => {
  const target = parseIntent("Rick Owens DU02D2369-SBB-0961 jeans");
  assert.equal(target.fields.styleCode, "DU02D2369-SBB-0961");
  assert.equal(
    assessMatch(target, listing("Rick Owens DU02D2369-SBB-099 jeans")).kind,
    "variant_mismatch",
  );
  assert.equal(
    assessMatch(target, listing("Rick Owens DU02D2369-SBB-0961 jeans")).kind,
    "code_match",
  );
});
test("bias-cut dresses are not classified as Bias Bootcut jeans", () => {
  const target = parseIntent("Rick Owens bias-cut silk dress");
  assert.equal(target.fields.model, null);
  assert.equal(
    assessMatch(target, listing("Rick Owens bias bootcut jeans")).kind,
    "variant_mismatch",
  );
});
test("missing finish stays unknown and wrong sizes are not close matches", () => {
  const target = parseIntent("Rick Owens bias bootcut jeans degrade W32");
  const result = assessMatch(target, listing("Rick Owens bias bootcut jeans"));
  assert.ok(result.missing.includes("finish"));
  assert.equal(result.kind, "variant_mismatch");
});
test("foreign jeans query expansion is scoped to jeans, not every Rick Owens item", () => {
  assert.equal(queryVariants(parseIntent("Rick Owens boots")).length, 1);
  const queries = queryVariants(
    parseIntent("Rick Owens bias bootcut jeans wax"),
  );
  assert.equal(queries.length, 3);
  assert.ok(queries.find((q) => q.language === "zh")!.text.includes("涂层"));
  assert.ok(!queries.some((q) => q.text.includes("渐变")));
});
test("URL classification rejects shops and editorial pages, preserves foreign IDs", () => {
  assert.equal(
    identifyListingUrl("https://www.grailed.com/designers/rick-owens"),
    null,
  );
  assert.equal(identifyListingUrl("https://www.ebay.com/itm/%ZZ"), null);
  assert.equal(
    identifyListingUrl("https://www.ebay.com.evil.test/itm/227343221934"),
    null,
  );
  assert.equal(
    identifyListingUrl("https://item.taobao.com/item.htm?id=123")!.itemId,
    "123",
  );
  assert.equal(
    identifyListingUrl("https://weidian.com/item.html?itemID=456")!.itemId,
    "456",
  );
});
test("eBay variations are different offers while indexed duplicates merge", () => {
  const offers = ["111", "222"].map((variation) => {
    const identity = identifyListingUrl(
      `https://www.ebay.com/itm/227343221934?var=${variation}`,
    )!;
    return {
      ...listing("Jeans"),
      sourceId: "ebay",
      sourceItemId: identity.itemId,
      url: identity.canonicalUrl,
    };
  });
  assert.equal(deduplicateListings(offers).length, 2);
  assert.equal(
    deduplicateListings([offers[0], { ...offers[0], price: null }]).length,
    1,
  );
});
test("seller corrections append evidence without rewriting source observations", () => {
  const original = recordEvidence(listing("Jeans"));
  const updated = applySellerCorrection(original, 0, 0, {
    median: 1000,
    count: 3,
  });
  assert.equal(original.evidence.sold, null);
  assert.equal(updated.evidence.sold, 0);
  const observations = updated.observations!.filter((o) => o.field === "sold");
  assert.equal(observations.length, 2);
  assert.equal(observations[0].method, "live_api");
  assert.equal(observations[0].value, null);
  assert.equal(observations[1].method, "manual_input");
  assert.equal(observations[1].value, 0);
});
test("freshness separates stale API records, index discovery and snapshots", () => {
  const observed = recordEvidence(listing("Jeans"));
  assert.equal(
    freshness(observed, Date.parse(observed.expiresAt!)),
    "Needs recheck",
  );
  assert.equal(
    freshness(recordEvidence({ ...listing("Jeans"), source: "research" })),
    "Reference snapshot",
  );
  assert.equal(
    freshness(recordEvidence(listing("Jeans"), "indexed_page")),
    "Indexed page · stock unknown",
  );
});
test("invalid comparable medians or counts never manufacture a price risk", () => {
  for (const comparison of [
    { median: Infinity, count: 3 },
    { median: 500, count: Infinity },
    { median: 500, count: 3.5 },
  ])
    assert.equal(
      scoreSeller(
        { ...unknownEvidence, sold: 0, active: 0 },
        { ...comparison, price: 1 },
      ).score,
      35,
    );
  assert.equal(
    scoreSeller({ ...unknownEvidence, feedbackScore: 9999, positiveRate: 1 })
      .score,
    null,
  );
});

test("seller edits never overwrite refreshed price, availability or source evidence", () => {
  const old = recordEvidence(listing("Jeans"));
  const correction = correctionFrom(
    applySellerCorrection(old, 0, 0, { median: 1000, count: 3 }),
  );
  const fresh = recordEvidence({
    ...listing("New jeans title"),
    price: 450,
    availability: "sold-out",
    checkedAt: "2026-09-14T00:00:00Z",
    evidence: { ...unknownEvidence, feedbackScore: 250 },
  });
  const merged = withSellerCorrection(fresh, correction);
  assert.equal(merged.price, 450);
  assert.equal(merged.availability, "sold-out");
  assert.equal(merged.checkedAt, fresh.checkedAt);
  assert.equal(merged.title, fresh.title);
  assert.equal(merged.evidence.feedbackScore, 250);
  assert.equal(merged.evidence.sold, 0);
  assert.equal(
    merged.observations!.find((o) => o.field === "price")!.value,
    450,
  );
});
