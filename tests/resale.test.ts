import test from "node:test";
import assert from "node:assert/strict";
import {
  gatResaleResearch,
  resaleResearchFor,
} from "../lib/resale-research.ts";
import { emptySearchPresentation } from "../lib/search-presentation.ts";
import { identifyListingUrl } from "../lib/listing-identity.ts";
import type { SearchRun, SourceState } from "../lib/discovery/types.ts";
const query = "Maison Margiela GAT white sneakers";
const run = (states: SourceState[]) =>
  ({
    sources: states.map((state) => ({ state })),
    status: "complete",
  }) as SearchRun;
const view = (
  states: SourceState[] | null,
  configured: boolean | null = true,
  issue: "failed" | "cancelled" | null = null,
  hasFilteredListings = false,
) =>
  emptySearchPresentation({
    run: states ? run(states) : null,
    configured,
    issue,
    hasFilteredListings,
  });

test("resale research stays scoped to submitted Margiela GAT identity and Legit", () => {
  assert.equal(resaleResearchFor(query, "legit").length, 6);
  assert.equal(
    resaleResearchFor(query, "legit", {
      brand: "maison margiela",
      model: "GAT",
    }).length,
    6,
  );
  assert.equal(
    resaleResearchFor("white sneakers", "legit", {
      brand: "Maison Margiela",
      model: "German Army Trainer",
    }).length,
    6,
  );
  for (const title of [
    "Rick Owens jeans",
    "Maison Margiela Tabi sneakers",
    "Novesta German Trainer",
    "Maison Margiela Replica fragrance",
  ])
    assert.equal(resaleResearchFor(title, "legit").length, 0);
  assert.equal(resaleResearchFor(query, "reps").length, 0);
  assert.equal(resaleResearchFor(query, "legit", { brand: "Nike" }).length, 0);
  assert.equal(resaleResearchFor(query, "legit", { model: "Tabi" }).length, 0);
});
test("resale examples remain dated snapshots with unknown current availability", () => {
  for (const listing of resaleResearchFor(query, "legit")) {
    assert.equal(listing.source, "research");
    assert.equal(listing.provenance, "reference_snapshot");
    assert.equal(listing.availability, "unknown");
    assert.ok(
      listing.observations?.every((o) => o.method === "reference_snapshot"),
    );
    assert.ok(identifyListingUrl(listing.url));
    assert.equal(listing.comparison, undefined);
  }
});
test("approximate sales and listed inventory never become exact seller counts", () => {
  assert.equal(
    gatResaleResearch.find((l) => l.seller === "rebeccasredo")!.evidence.sold,
    null,
  );
  const mercari = gatResaleResearch.find((l) => l.platform === "Mercari US")!;
  assert.equal(mercari.evidence.active, null);
  assert.equal(mercari.evidence.sold, 160);
  assert.equal(mercari.evidence.reviews, 162);
  assert.equal(
    gatResaleResearch.find((l) => l.platform === "eBay")!.evidence.sold,
    null,
  );
});
test("variant conflicts and unnamed models do not become exact GAT matches", () => {
  const research = resaleResearchFor("Maison Margiela GAT white EU42", "legit");
  assert.equal(
    research.find((l) => l.size === "US 10.5")!.matchAssessment?.kind,
    "variant_mismatch",
  );
  const unspecified = resaleResearchFor("Maison Margiela GAT", "legit").find(
    (l) => l.id === "resale-poshmark-white-46",
  )!;
  assert.equal(unspecified.matchAssessment?.kind, "unverified");
});
test("US and Japanese Mercari listing identities remain distinct", () => {
  assert.equal(
    identifyListingUrl("https://www.mercari.com/us/item/m28442814711/")
      ?.sourceId,
    "mercari_us",
  );
  assert.equal(
    identifyListingUrl("https://jp.mercari.com/item/m28442814711")?.sourceId,
    "mercari",
  );
  assert.equal(
    identifyListingUrl("https://www.mercari.com/search/?keyword=GAT"),
    null,
  );
});
test("unconfigured sources never imply no inventory and ignore inapplicable providers", () => {
  assert.match(view(null, false).title, /not connected/);
  assert.match(
    view(["not_applicable", "not_configured"]).title,
    /not connected/,
  );
  assert.match(
    view(["not_configured", "not_configured"]).body,
    /No live marketplaces have been searched/,
  );
});
test("empty completed search, partial source failure, network failure and cancellation differ", () => {
  assert.match(view(["empty", "empty"]).title, /No matches returned/);
  assert.match(view(["empty", "timeout"]).title, /coverage is incomplete/);
  assert.match(
    view(["auth_error", "not_configured"]).title,
    /coverage is incomplete/,
  );
  assert.match(view(null, false, "failed").title, /could not complete/);
  assert.match(view(null, false, "failed", true).title, /could not complete/);
  assert.match(
    view(["timeout"], true, null, true).title,
    /coverage is incomplete/,
  );
  assert.match(view(null, true, "cancelled").title, /cancelled/);
  assert.match(view(null, true).title, /Ready to search/);
  assert.match(view(null, null).title, /Checking/);
});
test("a failed source setup check does not remain pending forever", () => {
  assert.match(
    emptySearchPresentation({
      run: null,
      configured: null,
      issue: null,
      hasFilteredListings: false,
      setupFailed: true,
    }).title,
    /could not be checked/,
  );
});
test("filter-empty messaging requires actual retrieved candidates", () => {
  assert.match(view(["ok"], true, null, true).title, /these filters/);
  assert.match(
    view(["not_configured"], false, null, false).title,
    /not connected/,
  );
});
