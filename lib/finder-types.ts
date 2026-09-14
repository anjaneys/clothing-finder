export type Lane = "legit" | "reps";
export type SellerEvidence = {
  sold: number | null; active: number | null; reviews: number | null;
  positiveRate: number | null; accountAgeDays: number | null;
  photos: "original" | "stock" | "copied" | null;
};
export type Listing = {
  comparison?: { median:number|null; count:number }; searchQuery?:string;
  id: string; title: string; platform: string; url: string; image?: string;
  price: number | null; currency: string; shipping: number | null;
  size: string; condition: string; lane: Lane;
  seller: string; evidence: SellerEvidence;
  availability: "available" | "unknown" | "sold-out";
  match: "close" | "related"; source: "research" | "live" | "manual";
  checkedAt: string; notes: string; authenticity: string;
};
export const unknownEvidence: SellerEvidence = { sold:null, active:null, reviews:null, positiveRate:null, accountAgeDays:null, photos:null };
export type SearchResponse = { listings: Listing[]; mode: "live" | "reference" | "links"; message: string; errors: string[] };
