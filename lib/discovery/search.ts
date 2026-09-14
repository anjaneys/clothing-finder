import { searchScope } from "./pagination.ts";
import type { Continuation } from "./pagination.ts";
import type { SearchResponse } from "../finder-types.ts";
import { deduplicateListings } from "../listing-identity.ts";
import { assessMatch, parseIntent, type ItemIntent } from "../item-intent.ts";
import type { SearchAdapter, SearchInput, SearchRun } from "./types.ts";

export async function discover(
  adapters: SearchAdapter[],
  input: SearchInput,
  fields: Partial<ItemIntent["fields"]> = {},
): Promise<SearchResponse> {
  const startedAt = new Date().toISOString();
  const intent = parseIntent(input.query, fields);
  const scope = await searchScope(input, fields);
  if (input.continuation && input.continuation.scope !== scope)
    throw new Error("Continuation does not match the submitted search.");
  const results = await Promise.all(
    adapters.map((adapter) => adapter.search(input)),
  );
  const sources = results.map((result) => result.status);
  const listings = deduplicateListings(
    results.flatMap((result) => result.listings),
  )
    .map((listing) => ({
      ...listing,
      matchAssessment: assessMatch(intent, listing),
    }))
    .sort((a, b) => b.matchAssessment.rank - a.matchAssessment.rank);
  const applicable = sources.filter(
    (source) => !["not_applicable", "not_requested"].includes(source.state),
  );
  const healthy = applicable.filter(
    (source) =>
      ["ok", "empty"].includes(source.state) &&
      (!source.coverage || source.coverage === "exhausted"),
  );
  const status: SearchRun["status"] = input.signal?.aborted
    ? "cancelled"
    : healthy.length === applicable.length && applicable.length > 0
      ? "complete"
      : listings.length || healthy.length
        ? "partial"
        : "unavailable";
  const next = Object.fromEntries(
    sources.filter((s) => s.next).map((s) => [s.id, s.next]),
  ) as Continuation["sources"];
  return {
    ...(Object.keys(next).length
      ? { continuation: { version: 1 as const, scope, sources: next } }
      : {}),
    listings,
    intent,
    mode: listings.length ? "live" : "links",
    errors: [],
    message:
      status === "cancelled"
        ? "Search cancelled."
        : listings.length
          ? "Search finished. Check source status, variant details and the original offer before comparing prices."
          : "No listing candidates returned. See each source’s status or open a marketplace below.",
    run: {
      id: crypto.randomUUID(),
      query: input.query,
      lane: input.lane,
      startedAt,
      finishedAt: new Date().toISOString(),
      sources,
      status,
      retention: "session_only",
    },
  };
}
