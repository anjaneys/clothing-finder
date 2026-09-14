import { z } from "zod";
import { recordEvidence } from "../evidence.ts";
import { identifyListingUrl, listingIdentity } from "../listing-identity.ts";
import { intentFields, type ItemIntent } from "../item-intent.ts";
import { scoreListing } from "../scoring.ts";
import type { Listing, Lane } from "../finder-types.ts";
import type { SearchRun } from "../discovery/types.ts";

const amount = z.number().finite().min(0).max(1e9).nullable();
const count = z.number().int().min(0).max(1e9).nullable();
const timestamp = z.string().datetime({ offset: true });
const https = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });
const scalar = z.union([z.string().max(1000), z.number().finite(), z.null()]);
const observation = z.object({
  field: z.string().max(80),
  state: z.enum(["observed", "unknown"]),
  rawValue: scalar,
  value: scalar,
  sourceUrl: https,
  observedAt: timestamp,
  expiresAt: timestamp.nullable(),
  method: z.enum([
    "live_api",
    "indexed_page",
    "public_page",
    "manual_input",
    "reference_snapshot",
  ]),
  meaning: z.string().max(1000),
  unknownReason: z
    .enum(["not_provided", "invalid", "not_supported"])
    .optional(),
});
export const storedListingSchema = z.object({
  id: z.string().min(1).max(500),
  sourceId: z.string().max(100).optional(),
  sourceItemId: z.string().max(1000).nullable().optional(),
  title: z.string().min(1).max(1000),
  platform: z.string().min(1).max(100),
  url: https,
  image: https.optional(),
  price: amount,
  currency: z.string().regex(/^[A-Z]{3}$/),
  shipping: amount,
  size: z.string().max(100),
  condition: z.string().max(500),
  lane: z.enum(["legit", "reps"]),
  seller: z.string().max(500),
  evidence: z.object({
    sold: count,
    active: count,
    reviews: count,
    feedbackScore: z.number().int().min(-1e9).max(1e9).nullable().optional(),
    positiveRate: z.number().min(0).max(1).nullable(),
    accountAgeDays: count,
    photos: z.enum(["original", "stock", "copied"]).nullable(),
  }),
  availability: z.enum(["available", "unknown", "sold-out", "stale"]),
  match: z.enum(["close", "related"]),
  source: z.enum(["research", "live", "manual"]),
  checkedAt: timestamp,
  observedAt: timestamp.optional(),
  expiresAt: timestamp.nullable().optional(),
  provenance: z
    .enum([
      "live_api",
      "indexed_page",
      "public_page",
      "manual_input",
      "reference_snapshot",
    ])
    .optional(),
  notes: z.string().max(20000),
  authenticity: z.string().max(1000),
  observations: z.array(observation).max(128).optional(),
  comparison: z
    .object({ median: amount, count: z.number().int().min(0).max(1e9) })
    .optional(),
  matchAssessment: z
    .object({
      version: z.literal("identity-v1"),
      kind: z.enum([
        "code_match",
        "model_match",
        "variant_mismatch",
        "unverified",
      ]),
      label: z.string().max(200),
      rank: z.number().finite(),
      reasons: z.array(z.string().max(1000)).max(30),
      missing: z.array(z.string().max(100)).max(30),
    })
    .optional(),
});
export const fieldsSchema = z
  .object(
    Object.fromEntries(
      intentFields.map((field) => [
        field,
        z.string().max(100).nullable().optional(),
      ]),
    ),
  )
  .strict();
export const saveSchema = z
  .object({
    runId: z.string().uuid(),
    query: z.string().trim().min(2).max(180),
    lane: z.enum(["legit", "reps"]),
    fields: fieldsSchema,
    listings: z.array(z.unknown()).min(1).max(100),
    sources: z
      .array(
        z.object({
          id: z.string().max(50),
          state: z.string().max(50),
          coverage: z.string().max(50).optional(),
          count: z.number().int().nonnegative(),
          pages: z.number().int().nonnegative(),
          requests: z.number().int().nonnegative(),
        }),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type StoragePolicy = { ebay: boolean; brave: boolean };
export type StoredSnapshot = {
  listing: Listing;
  trustScore: number | null;
  trustCoverage: number;
  scoringVersion: "seller-v1";
};
export function prepareStorage(
  rows: unknown[],
  lane: Lane,
  policy: StoragePolicy,
) {
  const snapshots: StoredSnapshot[] = [];
  const skipped = { invalid: 0, policy: 0, lane: 0 };
  for (const raw of rows) {
    const parsed = storedListingSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.invalid++;
      continue;
    }
    const listing = recordEvidence(parsed.data as Listing);
    if (listing.lane !== lane) {
      skipped.lane++;
      continue;
    }
    const identity = identifyListingUrl(listing.url);
    if (
      (listing.provenance === "indexed_page" && !policy.brave) ||
      (listing.provenance === "live_api" &&
        (identity?.sourceId === "ebay" ||
          listing.sourceId === "ebay" ||
          listing.platform.toLowerCase() === "ebay") &&
        !policy.ebay)
    ) {
      skipped.policy++;
      continue;
    }
    listing.url = identity?.canonicalUrl ?? listingIdentity(listing.url);
    if (identity) {
      listing.sourceId = identity.sourceId;
      listing.sourceItemId = identity.itemId;
    }
    // Seller handles and observations are retained, not a fabricated permanent seller ID.
    const {
      sellerRecord: _sellerRecord,
      searchQuery: _searchQuery,
      ...safe
    } = listing;
    const assessment = scoreListing(listing);
    snapshots.push({
      listing: safe,
      trustScore: assessment.score,
      trustCoverage: assessment.coverage,
      scoringVersion: "seller-v1",
    });
  }
  return { snapshots, skipped };
}
export function publicCloudConfig(url: string, key: string) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash ||
      parsed.port
    )
      return null;
    let publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!publishable && key.split(".").length === 3) {
      const payload = JSON.parse(
        atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      );
      publishable = payload.role === "anon";
    }
    return publishable ? { url: parsed.origin, publishableKey: key } : null;
  } catch {
    return null;
  }
}
export type LibrarySession = {
  runId: string | null;
  query: string;
  lane: Lane;
  fields: Partial<ItemIntent["fields"]>;
  listings: Listing[];
  run: SearchRun | null;
  busy: boolean;
};
export type SavedSearch = {
  id: string;
  query: string;
  lane: Lane;
  target_fields: Partial<ItemIntent["fields"]>;
  updated_at: string;
};
export type LibraryRow = {
  id: string;
  search_id: string;
  listing_key: string;
  observed_at: string;
  imported_at: string;
  price: number | null;
  currency: string;
  platform: string;
  availability: Listing["availability"];
  trust_score: number | null;
  snapshot: StoredSnapshot;
};
export type LibraryFilters = {
  searchId: string | null;
  lane: Lane;
  currency: string;
  platform: string;
  text: string;
};
export type LibraryStats = {
  total: number;
  priced: number;
  missingPrice: number;
  unknownTrust: number;
  min: number | null;
  median: number | null;
  max: number | null;
  marketplaces: { label: string; count: number }[];
  availability: { label: string; count: number }[];
  trust: { label: string; count: number }[];
  prices: { label: string; count: number }[];
};
export function previewStats(
  rows: Listing[],
  filters: LibraryFilters,
): { rows: Listing[]; stats: LibraryStats } {
  const filtered = rows.filter(
    (l) =>
      l.lane === filters.lane &&
      l.currency === filters.currency &&
      (!filters.platform || l.platform === filters.platform) &&
      (!filters.text ||
        `${l.title} ${l.seller} ${l.size}`
          .toLowerCase()
          .includes(filters.text.toLowerCase())),
  );
  const prices = filtered
    .flatMap((l) => (l.price === null ? [] : [l.price]))
    .sort((a, b) => a - b);
  const group = (labels: string[]) =>
    [
      ...labels.reduce(
        (map, label) => map.set(label, (map.get(label) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const min = prices[0] ?? null,
    max = prices.at(-1) ?? null;
  const bins = new Array(8).fill(0) as number[];
  if (min !== null && max !== null)
    for (const price of prices)
      bins[
        max === min
          ? 0
          : Math.min(7, Math.floor(((price - min) / (max - min)) * 8))
      ]++;
  return {
    rows: filtered,
    stats: {
      total: filtered.length,
      priced: prices.length,
      missingPrice: filtered.length - prices.length,
      unknownTrust: filtered.filter((l) => scoreListing(l).score === null)
        .length,
      min,
      max,
      median: prices.length ? prices[Math.ceil(prices.length / 2) - 1] : null,
      marketplaces: group(filtered.map((l) => l.platform)),
      availability: group(filtered.map((l) => l.availability)),
      trust: group(filtered.map((l) => scoreListing(l).label)),
      prices:
        min === null || max === null
          ? []
          : bins
              .map((count, i) => ({
                label:
                  max === min
                    ? String(min)
                    : `${Math.round(min + ((max - min) / 8) * i)}–${Math.round(min + ((max - min) / 8) * (i + 1))}`,
                count,
              }))
              .filter((bin) => bin.count > 0),
    },
  };
}
