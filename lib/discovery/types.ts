import type { Lane, Listing } from "../finder-types.ts";

export type ProviderId = "ebay" | "brave";
export type SourceState =
  | "not_configured"
  | "not_applicable"
  | "ok"
  | "empty"
  | "partial"
  | "auth_error"
  | "access_denied"
  | "rate_limited"
  | "timeout"
  | "cancelled"
  | "invalid_response"
  | "unavailable"
  | "circuit_open";

export interface SourceDefinition {
  id: ProviderId;
  name: string;
  operations: readonly ("text" | "image" | "detail")[];
  lanes: readonly Lane[];
  region: string;
  access: "authorized_api" | "licensed_search_index";
  timeoutMs: number;
  maxPages: number;
  maxRequests: number;
  maxConcurrent: number;
  retention: "request_only" | "approved_memory_cache";
}

export interface SourceStatus {
  id: ProviderId;
  name: string;
  state: SourceState;
  message: string;
  count: number;
  requests: number;
  pages: number;
  skipped: number;
  hasMore: boolean;
  fromCache: boolean;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  retryAfterMs?: number;
  errorCode?: SourceState;
  operation?: "text" | "image";
  queryTruncated?: boolean;
}

export interface SearchRun {
  id: string;
  query: string;
  lane: Lane;
  startedAt: string;
  finishedAt: string;
  sources: SourceStatus[];
  status: "complete" | "partial" | "unavailable" | "cancelled";
  retention: "session_only";
}

export interface ProviderResult {
  listings: Listing[];
  status: SourceStatus;
}
export interface SearchInput {
  query: string;
  lane: Lane;
  signal?: AbortSignal;
  imageBase64?: string;
}
export interface SearchAdapter {
  definition: SourceDefinition;
  configured(): boolean;
  search(input: SearchInput): Promise<ProviderResult>;
}

export interface RuntimeOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  maxPages?: number;
  maxRequests?: number;
}

export const sourceMessages: Record<SourceState, string> = {
  not_configured: "Credentials have not been configured.",
  not_applicable: "This source does not support this section or search method.",
  ok: "Source returned results. Check item details and availability.",
  empty: "The source returned no matching listings.",
  partial: "Some results are available; coverage is incomplete.",
  auth_error: "Credentials were rejected or expired. Check source setup.",
  access_denied: "The account does not have access to this operation.",
  rate_limited: "The provider's request allowance has been reached. Try later.",
  timeout: "The source did not finish before the search deadline.",
  cancelled: "The search was cancelled.",
  invalid_response: "The source returned data that could not be validated.",
  unavailable: "The source could not be reached. Try later.",
  circuit_open: "This source is temporarily paused after repeated failures.",
};
