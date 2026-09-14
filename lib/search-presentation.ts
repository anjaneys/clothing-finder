import type { SearchRun } from "./discovery/types.ts";

export function emptySearchPresentation(input: {
  run: SearchRun | null;
  configured: boolean | null;
  issue: "failed" | "cancelled" | null;
  hasFilteredListings: boolean;
  setupFailed?: boolean;
}) {
  if (input.issue === "failed")
    return {
      title: "Live search could not complete.",
      body: "This is a search failure, not evidence that the item is unavailable. Check source status or open a marketplace directly.",
    };
  if (input.issue === "cancelled" || input.run?.status === "cancelled")
    return {
      title: "Live search was cancelled.",
      body: "No conclusion about availability was made. Search again or use the marketplace links.",
    };
  const applicable =
    input.run?.sources.filter((source) => source.state !== "not_applicable") ??
    [];
  if (
    (applicable.length &&
      applicable.every((source) => source.state === "not_configured")) ||
    (!input.run && input.configured === false)
  )
    return {
      title: "Live search is not connected.",
      body: "No live marketplaces have been searched. Researched examples and direct marketplace links still work; connect a source for automatic discovery.",
    };
  if (
    applicable.some(
      (source) => !["ok", "empty", "not_configured"].includes(source.state),
    )
  )
    return {
      title: "Live search coverage is incomplete.",
      body: "A source failed or reached its limit. Missing results do not mean the item is unavailable; inspect the source status above.",
    };
  if (!input.run && input.setupFailed)
    return {
      title: "Live search setup could not be checked.",
      body: "Connection status is unavailable. Retry the search or refresh; no conclusion about item availability was made.",
    };
  if (input.hasFilteredListings)
    return {
      title: "No listings match these filters.",
      body: "Clear the marketplace, size or budget filters to see the retrieved listings.",
    };
  if (input.run)
    return {
      title: "No matches returned by the searched sources.",
      body: "This search does not cover every resale website. Try a shorter title, another size, or the direct marketplace links.",
    };
  return {
    title:
      input.configured === null
        ? "Checking live search setup…"
        : "Ready to search resale marketplaces.",
    body: "Search to retrieve additional listings. Researched examples are dated observations, not a live inventory count.",
  };
}
