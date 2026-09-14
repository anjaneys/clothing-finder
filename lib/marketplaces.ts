import { parseIntent, queryVariants } from "./item-intent.ts";
import type { Lane } from "./finder-types";
export type Marketplace = {
  id: string;
  name: string;
  domain: string;
  lanes: Lane[];
  route: string;
  hint: string;
  search: (q: string) => string;
};
const enc = encodeURIComponent;
export const marketplaces: Marketplace[] = [
  {
    id: "grailed",
    name: "Grailed",
    domain: "grailed.com",
    lanes: ["legit"],
    route: "Direct",
    hint: "Designer resale",
    search: (q) => `https://www.grailed.com/shop?query=${enc(q)}`,
  },
  {
    id: "depop",
    name: "Depop",
    domain: "depop.com",
    lanes: ["legit"],
    route: "Direct",
    hint: "Independent sellers",
    search: (q) => `https://www.depop.com/search/?q=${enc(q)}`,
  },
  {
    id: "ebay",
    name: "eBay",
    domain: "ebay.com",
    lanes: ["legit"],
    route: "Direct",
    hint: "Resale · offers & auctions",
    search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}`,
  },
  {
    id: "vinted",
    name: "Vinted",
    domain: "vinted.com",
    lanes: ["legit"],
    route: "Regional",
    hint: "Availability varies by country",
    search: (q) => `https://www.vinted.com/catalog?search_text=${enc(q)}`,
  },
  {
    id: "facebook",
    name: "Facebook",
    domain: "facebook.com",
    lanes: ["legit"],
    route: "Local",
    hint: "Marketplace · login & location",
    search: (q) =>
      `https://www.facebook.com/marketplace/search/?query=${enc(q)}`,
  },
  {
    id: "etsy",
    name: "Etsy",
    domain: "etsy.com",
    lanes: ["legit"],
    route: "Direct",
    hint: "Vintage & independent shops",
    search: (q) => `https://www.etsy.com/search?q=${enc(q)}`,
  },
  {
    id: "poshmark",
    name: "Poshmark",
    domain: "poshmark.com",
    lanes: ["legit"],
    route: "Regional",
    hint: "Resale · check shipping region",
    search: (q) => `https://poshmark.com/search?query=${enc(q)}&type=listings`,
  },
  {
    id: "mercari",
    name: "Mercari Japan",
    domain: "jp.mercari.com",
    lanes: ["legit"],
    route: "Proxy / Japan",
    hint: "Japanese resale · proxy may be needed",
    search: (q) => `https://jp.mercari.com/search?keyword=${enc(q)}`,
  },
  {
    id: "rakuma",
    name: "Rakuma",
    domain: "fril.jp",
    lanes: ["legit"],
    route: "Proxy / Japan",
    hint: "Japanese resale",
    search: (q) => `https://fril.jp/s?query=${enc(q)}`,
  },
  {
    id: "yahoo",
    name: "Yahoo! Auctions",
    domain: "auctions.yahoo.co.jp",
    lanes: ["legit"],
    route: "Proxy / Japan",
    hint: "Auctions · bids are not final prices",
    search: (q) => `https://auctions.yahoo.co.jp/search/search?p=${enc(q)}`,
  },
  {
    id: "taobao",
    name: "Taobao",
    domain: "taobao.com",
    lanes: ["reps"],
    route: "Proxy / China",
    hint: "Search candidates · authenticity varies",
    search: (q) => `https://s.taobao.com/search?q=${enc(q)}`,
  },
  {
    id: "1688",
    name: "1688",
    domain: "1688.com",
    lanes: ["reps"],
    route: "Proxy / China",
    hint: "Check minimum order & domestic freight",
    search: (q) =>
      `https://s.1688.com/selloffer/offer_search.htm?keywords=${enc(q)}`,
  },
  {
    id: "weidian",
    name: "Weidian",
    domain: "weidian.com",
    lanes: ["reps"],
    route: "Proxy / China",
    hint: "Store listings · often needs an agent",
    search: (q) =>
      `https://www.google.com/search?q=${enc(`site:weidian.com/item.html ${q}`)}`,
  },
];
export function marketplaceForUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    return marketplaces.find(
      (m) => url.hostname === m.domain || url.hostname.endsWith(`.${m.domain}`),
    );
  } catch {
    return undefined;
  }
}
export function searchQuery(q: string, lane: Lane) {
  return lane === "reps"
    ? (queryVariants(parseIntent(q)).find((v) => v.language === "zh")?.text ??
        q)
    : q;
}
