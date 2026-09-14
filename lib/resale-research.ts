import { unknownEvidence, type Listing, type Lane } from "./finder-types.ts";
import {
  isGatQuery,
  parseIntent,
  assessMatch,
  type ItemIntent,
} from "./item-intent.ts";
import { recordEvidence } from "./evidence.ts";

export const resaleCheckedAt = "2026-09-14";
const base = {
  currency: "USD",
  lane: "legit" as const,
  source: "research" as const,
  availability: "unknown" as const,
  checkedAt: resaleCheckedAt,
  match: "related" as const,
  evidence: { ...unknownEvidence },
  authenticity: "Offered as Maison Margiela · not independently authenticated",
};
// Dated public-page observations. Never injected into live API responses or price benchmarks.
export const gatResaleResearch: Listing[] = [
  {
    ...base,
    id: "resale-poshmark-beige-105",
    platform: "Poshmark",
    title: "Maison Martin Margiela Replica sneakers · beige / tan",
    url: "https://poshmark.com/listing/Maison-Martin-Margiela-Replica-Sneakers-Mens-105-Beige-Leather-Suede-Gum-Sole-6a9b4b5f2800ac4ae5a5167c",
    image:
      "https://di2ponv0v5otw.cloudfront.net/posts/2026/09/04/6a9b4b5f2800ac4ae5a5167c/l_6a9b4b5f2800ac4ae5a5167d.jpg",
    price: 85,
    shipping: 6.49,
    size: "US 10.5",
    condition: "Pre-owned · Good",
    seller: "rebeccasredo",
    notes:
      "Beige/tan alternative to the white demo. Buy Now and Make Offer displayed. Seller profile reports 300+ items sold and membership since 2021; approximate sales are not an exact count. Recheck condition, size, shipping and stock on the source.",
  },
  {
    ...base,
    id: "resale-poshmark-white-46",
    platform: "Poshmark",
    title: "Maison Martin Margiela White and Light Gray Suede-Trim Sneakers",
    url: "https://poshmark.com/listing/Maison-Martin-Margiela-White-and-Light-Gray-SuedeTrim-Sneakers-6aa1d29a05ce57fcddd6b0b9",
    image:
      "https://di2ponv0v5otw.cloudfront.net/posts/2026/09/09/6aa1d29a05ce57fcddd6b0b9/l_6aa1d2a14adcb38edfa427dc.jpg",
    price: 225,
    shipping: 6.49,
    size: "US 12",
    condition: "Pre-owned · Like New",
    seller: "kalehookfin",
    notes:
      "GAT-style candidate; listing does not name Replica or a style code. Purchase and offer buttons displayed. Size selector says US 12; description says 46. Confirm the size tag instead of assuming conversion. Seller joined 2024; sales count and current stock unverified.",
  },
  {
    ...base,
    id: "resale-depop-white-silver-7",
    platform: "Depop",
    title: "Maison Margiela GAT sneakers · white / silver",
    url: "https://www.depop.com/products/jrd_1-maison-margiela-white-silver/",
    image:
      "https://media-photos.depop.com/b1/41282585/2857254215_8dece93a656346c3b40636c1fd55fb89/P0.jpg",
    price: 146.25,
    currency: "GBP",
    shipping: null,
    size: "UK 7",
    condition: "Pre-owned · Excellent",
    seller: "jrd_1",
    evidence: { ...unknownEvidence, sold: 39 },
    notes:
      "Seller describes wearing them a few times. White/silver differs from the classic suede target. Listing displays a price and is not marked sold; checkout and international delivery unverified. Profile shows 39 sold. Currency remains GBP; no exchange rate assumed.",
  },
  {
    ...base,
    id: "resale-mercari-white-42",
    platform: "Mercari US",
    title: "Maison Margiela Replica GAT sneakers · white",
    url: "https://www.mercari.com/us/item/m28442814711/",
    image:
      "https://u-mercari-images.mercdn.net/photos/m28442814711_1.jpg?_=1773778432&quality=75&width=1280",
    price: 455,
    shipping: 0,
    size: "EU 42",
    condition: "Pre-owned · Good",
    seller: "Elena@galleryeight",
    evidence: { ...unknownEvidence, sold: 160, reviews: 162 },
    notes:
      "Buy Now displayed. Free shipping plus $16.38 buyer-protection fee shown; tax extra. Profile reports 160 sales, 162 reviews and 235 listed; listed does not establish active inventory. Description calls them MM6: confirm label/style code. Seller claims cleaned; stock requires recheck.",
    authenticity:
      "Mercari Authenticated label observed · not independently verified by Clothing Finder",
  },
  {
    ...base,
    id: "resale-grailed-white-46",
    platform: "Grailed",
    title: "Maison Margiela Replica GAT sneakers · white / grey",
    url: "https://www.grailed.com/listings/95827937-maison-margiela-maison-margiela-replica-gat-sneakers-white-grey-46-13",
    image:
      "https://media-assets.grailed.com/prd/listing/temp/cf48127edc2f4a9aa33cdd83429d1334",
    price: 629,
    shipping: 15.99,
    size: "EU 46",
    condition: "Gently Used",
    seller: "Seller history unavailable",
    notes:
      "Page displays an asking price, not a sold-price label. Description reports S57WS0175, wear, darkened suede and original packaging; not the demo's full style code. Seller history unavailable. This is an asking-price example, not a best-deal recommendation.",
    authenticity:
      "Grailed Verified badge observed · not independent authentication by Clothing Finder",
  },
  {
    ...base,
    id: "resale-ebay-white-42",
    platform: "eBay",
    title: "Maison Margiela Replica GAT sneakers · white / gray",
    url: "https://www.ebay.com/itm/157674001613",
    image: "https://i.ebayimg.com/images/g/h9cAAeSwtWFqUXA0/s-l140.webp",
    price: 699.99,
    shipping: 14.95,
    size: "EU 42",
    condition: "Pre-owned · Good",
    seller: "Freemanmerchants",
    evidence: { ...unknownEvidence, feedbackScore: 5942, positiveRate: 0.996 },
    notes:
      "Buy It Now / Best Offer shown. Seller page reports 99.6% positive, net feedback 5,942 and rounded 6.6K sold; exact sales/review counts remain unknown. Snapshot may be cached. At this asking price it is not presented as a bargain. Recheck stock and destination charges.",
    authenticity:
      "eBay Authenticity Guarantee shown · eligibility must be confirmed",
  },
];

export function resaleResearchFor(
  query: string,
  lane: Lane,
  fields: Partial<ItemIntent["fields"]> = {},
) {
  const intent = parseIntent(query, fields);
  const brand = parseIntent(intent.fields.brand ?? "").fields.brand;
  if (
    lane !== "legit" ||
    brand !== "Maison Margiela" ||
    !isGatQuery(intent.fields.model ?? "")
  )
    return [];
  const resolved = {
    ...intent,
    fields: { ...intent.fields, brand, model: "German Army Trainer" },
  };
  return gatResaleResearch.map((listing) => ({
    ...recordEvidence(listing),
    matchAssessment: assessMatch(resolved, listing),
  }));
}
