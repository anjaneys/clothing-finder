import type { SellerEvidence, Listing } from "./finder-types";
export type Comparison = {
  median: number | null;
  price: number | null;
  count: number;
};
export function scoreSeller(e: SellerEvidence, comparison?: Comparison) {
  let score = 50,
    observed = 0;
  const reasons: string[] = [];
  const known = (n: number | null) =>
    n !== null && Number.isFinite(n) && n >= 0;
  if (known(e.sold)) {
    observed++;
    if (e.sold === 0) {
      score -= 10;
      reasons.push("No recorded sales");
    } else {
      score += Math.min(26, Math.log10(e.sold! + 1) * 13);
      reasons.push(`${e.sold} recorded sales`);
    }
  }
  if (known(e.active)) {
    observed++;
    if (e.active! > 0) {
      score += 4;
      reasons.push(`${e.active} active listings`);
    } else if (e.sold === 0) {
      score -= 5;
      reasons.push("No active listings or sales history");
    }
  }
  if (
    known(e.reviews) &&
    (e.reviews === 0 || (known(e.positiveRate) && e.positiveRate! <= 1))
  ) {
    observed++;
    if (e.reviews! > 0) {
      score +=
        Math.max(-28, Math.min(12, (e.positiveRate! - 0.85) * 80)) *
        Math.min(e.reviews! / 20, 1);
      reasons.push(
        `${Math.round(e.positiveRate! * 100)}% positive · ${e.reviews} feedback`,
      );
    }
  }
  if (known(e.accountAgeDays)) {
    observed++;
    if (e.accountAgeDays! < 30) {
      score -= 5;
      reasons.push("Account less than 30 days old");
    } else if (e.accountAgeDays! >= 180) {
      score += 6;
      reasons.push("Account established for over six months");
    }
  }
  if (e.photos) {
    observed++;
    if (e.photos === "original") {
      score += 8;
      reasons.push("Original photos verified");
    }
    if (e.photos === "copied") {
      score -= 18;
      reasons.push("Photo reuse verified");
    }
  }
  const supported =
    !!comparison &&
    Number.isSafeInteger(comparison.count) &&
    comparison.count >= 3 &&
    comparison.median !== null &&
    Number.isFinite(comparison.median) &&
    comparison.median > 0 &&
    comparison.price !== null &&
    Number.isFinite(comparison.price) &&
    comparison.price >= 0;
  const ratio = supported ? comparison!.price! / comparison!.median! : null;
  const extreme = ratio !== null && ratio < 0.4;
  if (extreme) {
    score -= 15;
    reasons.push("Price below 40% of the comparable median");
  } else if (ratio !== null && ratio < 0.65) {
    score -= 7;
    reasons.push("Price unusually low versus comparable items");
  }
  if (e.sold === 0 && e.active === 0 && extreme) {
    score = Math.min(score, 25);
    reasons.push("Very low price with no seller history");
  }
  if (
    (e.sold === null || e.sold === 0) &&
    (e.reviews === null || e.reviews === 0)
  )
    score = Math.min(score, 65);
  const insufficient = observed < 2 && !extreme;
  const value = insufficient
    ? null
    : Math.round(Math.max(0, Math.min(98, score)));
  return {
    score: value,
    coverage: observed / 5,
    reasons,
    label:
      value === null
        ? "Not enough evidence"
        : value >= 80
          ? "Strong history"
          : value >= 60
            ? "Some positive evidence"
            : value >= 35
              ? "Use caution"
              : "High risk",
  };
}
export function landedCost(parts: (number | null)[], exchangeRate: number) {
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0)
    return { subtotal: null, total: null, missing: parts.length };
  const valid = (p: number | null) =>
    p !== null && Number.isFinite(p) && p >= 0;
  const subtotal =
    Math.round(
      parts.reduce<number>((sum, p) => sum + (valid(p) ? p! : 0), 0) *
        exchangeRate *
        100,
    ) / 100;
  const missing = parts.filter((p) => !valid(p)).length;
  return { subtotal, total: missing ? null : subtotal, missing };
}

export function scoreListing(listing: Listing) {
  return scoreSeller(
    listing.evidence,
    listing.comparison
      ? { ...listing.comparison, price: listing.price }
      : undefined,
  );
}
