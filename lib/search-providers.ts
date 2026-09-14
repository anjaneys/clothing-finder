import { config } from "./server-config";
import { createAdapters } from "./discovery/providers";
import { discover } from "./discovery/search";
import type { SearchInput } from "./discovery/types";
import type { ItemIntent } from "./item-intent";

// Server routes only. Keys and the fingerprint never leave the server.
let fingerprint = "";
let adapters: ReturnType<typeof createAdapters> | undefined;
export function searchSources(
  input: SearchInput,
  fields: Partial<ItemIntent["fields"]>,
) {
  const settings = {
    ebay: {
      clientId: config("EBAY_CLIENT_ID"),
      clientSecret: config("EBAY_CLIENT_SECRET"),
      accessToken: config("EBAY_ACCESS_TOKEN"),
    },
    publicSearch: config("POSHMARK_PUBLIC_SEARCH") !== "false",
    braveKey: config("BRAVE_SEARCH_API_KEY"),
    cache: { ebay: cacheTTL("EBAY"), brave: cacheTTL("BRAVE") },
  };
  const next = JSON.stringify(settings);
  if (!adapters || next !== fingerprint) {
    adapters = createAdapters(settings);
    fingerprint = next;
  }
  return discover(adapters, input, fields);
}
function cacheTTL(provider: string) {
  if (config(`${provider}_STORAGE_ALLOWED`) !== "true") return 0;
  const seconds = Number(config(`${provider}_CACHE_TTL_SECONDS`));
  return Number.isFinite(seconds) ? Math.max(0, Math.min(300, seconds)) : 0;
}
