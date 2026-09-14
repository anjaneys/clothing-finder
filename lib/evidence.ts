import type {
  EvidenceObservation,
  Listing,
  Provenance,
} from "./finder-types.ts";

export type SellerCorrection = {
  sold: number | null;
  active: number | null;
  comparison: Listing["comparison"];
  observations: EvidenceObservation[];
};
export function correctionFrom(listing: Listing): SellerCorrection {
  return {
    sold: listing.evidence.sold,
    active: listing.evidence.active,
    comparison: listing.comparison,
    observations: (listing.observations ?? []).filter(
      (o) =>
        o.method === "manual_input" && ["sold", "active"].includes(o.field),
    ),
  };
}
/** Reapply only user edits to a refreshed offer; never replace its new price, stock or matching. */
export function withSellerCorrection(
  listing: Listing,
  correction?: SellerCorrection,
): Listing {
  if (!correction) return listing;
  const original = recordEvidence(listing);
  return {
    ...original,
    comparison: correction.comparison,
    evidence: {
      ...original.evidence,
      sold: correction.sold,
      active: correction.active,
    },
    observations: [...original.observations!, ...correction.observations],
    sellerRecord: {
      ...original.sellerRecord!,
      observations: [
        ...original.sellerRecord!.observations,
        ...correction.observations,
      ],
    },
  };
}

const meanings: Record<string, string> = {
  sold: "Seller's recorded sales, not one item's sold quantity",
  active: "Seller's active listing count",
  reviews: "Seller review count, not product reviews or net feedback score",
  feedbackScore:
    "Platform net feedback score; may be negative and is not a count of reviews or sales",
  positiveRate:
    "Positive feedback fraction; source reporting period may be unspecified",
  accountAgeDays: "Account age in days at observation time",
  photos: "Photo evidence verified by the stated observation method",
};

export function recordEvidence(listing: Listing, method?: Provenance): Listing {
  const provenance =
    method ??
    listing.provenance ??
    (listing.source === "research"
      ? "reference_snapshot"
      : listing.source === "manual"
        ? "manual_input"
        : "live_api");
  const observedAt = listing.observedAt ?? listing.checkedAt;
  const expiresAt =
    listing.expiresAt ??
    (provenance === "live_api"
      ? new Date(Date.parse(observedAt) + 15 * 60000).toISOString()
      : null);
  const observation = (
    field: string,
    value: string | number | null,
    meaning: string,
  ): EvidenceObservation => ({
    field,
    value,
    rawValue: value,
    state: value === null ? "unknown" : "observed",
    sourceUrl: listing.url,
    observedAt,
    expiresAt,
    method: provenance,
    meaning,
    ...(value === null ? { unknownReason: "not_provided" as const } : {}),
  });
  const sellerObservations = Object.entries(meanings).map(([field, meaning]) =>
    observation(
      field,
      listing.evidence[field as keyof typeof listing.evidence] ?? null,
      meaning,
    ),
  );
  const observations = [
    observation(
      "price",
      listing.price,
      "Observed asking price, not a completed sale",
    ),
    observation(
      "currency",
      listing.currency === "XXX" ? null : listing.currency,
      "Original quote currency",
    ),
    ...sellerObservations,
  ];
  return {
    ...listing,
    provenance,
    observedAt,
    expiresAt,
    observations: listing.observations ?? observations,
    sellerRecord: listing.sellerRecord ?? {
      id: /unknown|unavailable|not specified/i.test(listing.seller)
        ? null
        : `${listing.platform.toLowerCase()}:${listing.seller}`,
      platform: listing.platform,
      displayName: listing.seller,
      observations: sellerObservations,
    },
  };
}

export function freshness(listing: Listing, now = Date.now()) {
  if (
    listing.provenance === "reference_snapshot" ||
    listing.source === "research"
  )
    return "Reference snapshot";
  if (listing.expiresAt && Date.parse(listing.expiresAt) <= now)
    return "Needs recheck";
  return listing.provenance === "indexed_page"
    ? "Indexed page · stock unknown"
    : listing.source === "manual"
      ? "Your observation"
      : "Recent API observation";
}

/** Keep original observations when a user applies corrections, rather than rewriting provenance. */
export function applySellerCorrection(
  listing: Listing,
  sold: number | null,
  active: number | null,
  comparison: Listing["comparison"],
): Listing {
  const original = recordEvidence(listing);
  const corrected = recordEvidence(
    {
      ...listing,
      evidence: { ...listing.evidence, sold, active },
      observations: undefined,
      sellerRecord: undefined,
      observedAt: new Date().toISOString(),
      expiresAt: null,
    },
    "manual_input",
  );
  const changes = corrected.observations!.filter(
    (o) => o.field === "sold" || o.field === "active",
  );
  return {
    ...original,
    comparison,
    evidence: corrected.evidence,
    observations: [...original.observations!, ...changes],
    sellerRecord: {
      ...original.sellerRecord!,
      observations: [...original.sellerRecord!.observations, ...changes],
    },
  };
}
