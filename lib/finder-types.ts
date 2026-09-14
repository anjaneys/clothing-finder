import type { SearchRun } from "./discovery/types.ts";
import type { ItemIntent, MatchAssessment } from "./item-intent.ts";

export type Lane = "legit" | "reps";
export type Provenance =
  | "live_api"
  | "indexed_page"
  | "manual_input"
  | "reference_snapshot";
export type EvidenceObservation = {
  field: string;
  state: "observed" | "unknown";
  rawValue: string | number | null;
  value: string | number | null;
  sourceUrl: string;
  observedAt: string;
  expiresAt: string | null;
  method: Provenance;
  meaning: string;
  unknownReason?: "not_provided" | "invalid" | "not_supported";
};
export type Seller = {
  id: string | null;
  platform: string;
  displayName: string;
  observations: EvidenceObservation[];
};
export type SellerEvidence = {
  sold: number | null;
  active: number | null;
  reviews: number | null;
  feedbackScore?: number | null;
  positiveRate: number | null;
  accountAgeDays: number | null;
  photos: "original" | "stock" | "copied" | null;
};
export type Listing = {
  provenance?: Provenance;
  sourceId?: string;
  sourceItemId?: string | null;
  observedAt?: string;
  expiresAt?: string | null;
  observations?: EvidenceObservation[];
  sellerRecord?: Seller;
  matchAssessment?: MatchAssessment;
  comparison?: { median: number | null; count: number };
  searchQuery?: string;
  id: string;
  title: string;
  platform: string;
  url: string;
  image?: string;
  price: number | null;
  currency: string;
  shipping: number | null;
  size: string;
  condition: string;
  lane: Lane;
  seller: string;
  evidence: SellerEvidence;
  availability: "available" | "unknown" | "sold-out" | "stale";
  match: "close" | "related";
  source: "research" | "live" | "manual";
  checkedAt: string;
  notes: string;
  authenticity: string;
};
export const unknownEvidence: SellerEvidence = {
  sold: null,
  active: null,
  reviews: null,
  feedbackScore: null,
  positiveRate: null,
  accountAgeDays: null,
  photos: null,
};
export type SearchResponse = {
  listings: Listing[];
  mode: "live" | "reference" | "links";
  message: string;
  errors: string[];
  run?: SearchRun;
  intent?: ItemIntent;
};
