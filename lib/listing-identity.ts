import type { Listing } from "./finder-types";
import { marketplaceForUrl } from "./marketplaces.ts";

/** Listing classification is structural, not a claim of current stock or authenticity. */
export function identifyListingUrl(
  raw: string,
): { sourceId: string; itemId: string; canonicalUrl: string } | null {
  const market = marketplaceForUrl(raw);
  if (!market) return null;
  const url = new URL(raw);
  if (url.port && url.port !== "443") return null;
  let itemId: string | null = null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  switch (market.id) {
    case "maden":
    case "novesta":
      itemId = path.match(/^\/(?:en\/)?products\/([^/]+)\/?$/)?.[1] ?? null;
      break;
    case "madeinchina":
      itemId =
        path.match(
          /\/(?:product-detail|product\/)([A-Za-z0-9]+)\/[^/]+\.html$/,
        )?.[1] ?? null;
      break;
    case "bona":
      itemId = path.match(/^\/product-catalog\/([^/]+)\/?$/)?.[1] ?? null;
      break;
    case "huangxuan":
      itemId = path.match(/^\/oem-shoes\/([^/]+)\.html$/)?.[1] ?? null;
      break;
    case "ebay":
      itemId =
        path.match(/\/(?:itm)\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/)?.[1] ?? null;
      break;
    case "grailed":
      itemId = path.match(/^\/listings\/(\d+)/)?.[1] ?? null;
      break;
    case "depop":
      itemId = path.match(/^\/products\/([^/]+)/)?.[1] ?? null;
      break;
    case "vinted":
      itemId = path.match(/^\/items\/(\d+)/)?.[1] ?? null;
      break;
    case "facebook":
      itemId = path.match(/^\/marketplace\/item\/(\d+)/)?.[1] ?? null;
      break;
    case "etsy":
      itemId = path.match(/^\/(?:[a-z]{2}\/)?listing\/(\d+)/)?.[1] ?? null;
      break;
    case "poshmark":
      itemId = path.match(/^\/listing\/.+-([a-f0-9]{24})/i)?.[1] ?? null;
      break;
    case "mercari":
      itemId =
        path.match(/^\/item\/(m\d+)/)?.[1] ??
        path.match(/^\/shops\/product\/([^/]+)/)?.[1] ??
        null;
      break;
    case "rakuma":
      itemId =
        url.hostname === "item.fril.jp"
          ? (path.match(/^\/([a-f0-9]{32})/i)?.[1] ?? null)
          : null;
      break;
    case "yahoo":
      itemId = path.match(/\/auction\/([a-z0-9]+)/i)?.[1] ?? null;
      break;
    case "taobao":
      itemId =
        path === "/item.htm" && /^\d+$/.test(url.searchParams.get("id") ?? "")
          ? url.searchParams.get("id")
          : null;
      break;
    case "1688":
      itemId = path.match(/^\/offer\/(\d+)\.html/)?.[1] ?? null;
      break;
    case "weidian":
      itemId =
        path === "/item.html" &&
        /^\d+$/.test(url.searchParams.get("itemID") ?? "")
          ? url.searchParams.get("itemID")
          : null;
      break;
  }
  if (market.id === "ebay" && itemId)
    itemId = `v1|${itemId}|${/^\d+$/.test(url.searchParams.get("var") ?? "") ? url.searchParams.get("var") : "0"}`;
  if ((market.id === "maden" || market.id === "novesta") && itemId) {
    const variant = url.searchParams.get("variant");
    if (variant && /^\d+$/.test(variant))
      itemId = `${itemId}|variant:${variant}`;
  }
  return itemId
    ? { sourceId: market.id, itemId, canonicalUrl: listingIdentity(raw) }
    : null;
}
export function listingIdentity(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  for (const name of [...url.searchParams.keys()])
    if (
      /^utm_|^(gclid|fbclid|_trksid|_trkparms|mkcid|mkevt|campid|toolid|customid)$/i.test(
        name,
      )
    )
      url.searchParams.delete(name);
  url.searchParams.sort();
  return url.href;
}
export function deduplicateListings(listings: Listing[]) {
  const byId = new Map<string, Listing>();
  const quality = (l: Listing) =>
    Number(l.price !== null) * 10 +
    Object.values(l.evidence).filter((v) => v !== null).length;
  for (const listing of listings) {
    const key =
      listing.sourceId && listing.sourceItemId
        ? `${listing.sourceId}:${listing.sourceItemId}`
        : listingIdentity(listing.url);
    const prior = byId.get(key);
    if (!prior || quality(listing) > quality(prior)) byId.set(key, listing);
  }
  return [...byId.values()];
}
