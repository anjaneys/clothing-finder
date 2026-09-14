import type { SearchRun } from "./discovery/types.ts";

/** Accumulate batch diagnostics without restarting or erasing finished sources. */
export function mergeSearchRun(
  previous: SearchRun | null,
  batch?: SearchRun,
): SearchRun | null {
  if (!batch) return previous;
  if (!previous) return batch;
  return {
    ...batch,
    startedAt: previous.startedAt,
    sources: batch.sources.map((source) => {
      const old = previous.sources.find((entry) => entry.id === source.id);
      if (!old) return source;
      if (source.state === "not_requested") return old;
      return {
        ...source,
        count: old.count + source.count,
        pages: old.pages + source.pages,
        requests: old.requests + source.requests,
        skipped: old.skipped + source.skipped,
        elapsedMs: old.elapsedMs + source.elapsedMs,
        startedAt: old.startedAt,
      };
    }),
  };
}
