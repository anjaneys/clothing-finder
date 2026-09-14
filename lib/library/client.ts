import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LibraryFilters,
  LibraryRow,
  LibrarySession,
  SavedSearch,
  StoragePolicy,
} from "./model.ts";

export type CloudSettings = {
  configured: boolean;
  url?: string;
  publishableKey?: string;
  storagePolicy: StoragePolicy;
};
export async function makeCloudClient(settings: CloudSettings) {
  if (!settings.configured || !settings.url || !settings.publishableKey)
    return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(settings.url, settings.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
export function rpcFilters(filters: LibraryFilters, before: string) {
  return {
    p_search_id: filters.searchId,
    p_lane: filters.lane,
    p_currency: filters.currency,
    p_platform: filters.platform,
    p_text: filters.text,
    p_before: before,
  };
}
export async function savedSearches(
  client: SupabaseClient,
  signal: AbortSignal,
) {
  const rows: SavedSearch[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client
      .from("cf_saved_searches")
      .select("id,query,lane,target_fields,updated_at")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(offset, offset + 99)
      .abortSignal(signal);
    if (error)
      throw new Error(
        "Could not read saved searches. Check your sign-in and database migration.",
      );
    rows.push(...(data as SavedSearch[]));
    if (data.length < 100) return rows;
  }
}
export async function saveSession(
  client: SupabaseClient,
  session: LibrarySession,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  if (!session.runId)
    throw new Error("Run a search before saving this collection.");
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to save your search.");
  let saved = 0,
    skipped = 0,
    searchId: string | null = null;
  for (let offset = 0; offset < session.listings.length; offset += 100) {
    const response = await fetch("/api/library/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal,
      body: JSON.stringify({
        runId: session.runId,
        query: session.query,
        lane: session.lane,
        fields: session.fields,
        listings: session.listings.slice(offset, offset + 100),
        sources: (session.run?.sources ?? []).map(
          ({ id, state, coverage, count, pages, requests }) => ({
            id,
            state,
            coverage,
            count,
            pages,
            requests,
          }),
        ),
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      saved: number;
      skipped: Record<string, number>;
      searchId: string | null;
    };
    if (!response.ok)
      throw new Error(
        result.error ?? "Cloud save failed; retry to finish remaining batches.",
      );
    saved += result.saved;
    skipped += Object.values(result.skipped as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    );
    searchId = result.searchId ?? searchId;
    progress(Math.min(offset + 100, session.listings.length));
  }
  return { saved, skipped, searchId };
}
/** Fetch every page at a fixed import-time cutoff, so concurrent saves cannot reshuffle the export. */
export async function exportRows(
  client: SupabaseClient,
  filters: LibraryFilters,
  before: string,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  const rows: LibraryRow[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client
      .rpc("cf_library_page", {
        ...rpcFilters(filters, before),
        p_offset: offset,
        p_limit: 100,
      })
      .abortSignal(signal);
    if (error) throw new Error("Export interrupted. Try again.");
    rows.push(...data.rows);
    progress(rows.length);
    if (rows.length >= data.total) return rows;
    if (!data.rows.length)
      throw new Error("The saved data changed during export. Try again.");
  }
}
