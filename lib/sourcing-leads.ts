import { isGatQuery } from "./item-intent.ts";

export const gatDemo = {
  query: "Maison Margiela GAT Replica sneakers white suede gum sole",
  title: "Maison Margiela GATs",
  code: "S57WS0236P1895101",
  source:
    "https://www.maisonmargiela.com/en-us/replica-sneakers-8053833630021.html",
  image:
    "https://www.maisonmargiela.com/on/demandware.static/-/Sites-margiela-master-catalog/default/dwf2c28dda/images/large/S57WS0236_P1895_101_F.jpg",
};
export type SourcingLead = {
  id: string;
  company: string;
  title: string;
  country: "China" | "Japan";
  kind: "independent" | "replica_lead" | "factory";
  purchase: "single" | "bulk" | "unconfirmed";
  url: string;
  companyUrl: string;
  image?: string;
  unitPrice: number | null;
  currency: "USD" | "JPY";
  priceNote: string;
  minimumOrder: number | null;
  minimumOrderNote: string;
  sizes: string;
  differences: string;
  shipping: string;
  shippingUrl: string;
  access: "page_checked" | "index_only" | "community_only";
  evidence: {
    text: string;
    url: string;
    basis:
      | "Published policy"
      | "Seller claim"
      | "Page observation"
      | "Community report";
  }[];
  gaps: string[];
};
export const sourcingCheckedAt = "2026-09-14";
// Research records, deliberately separate from live listings, live price ranking and seller metrics.
export const gatLeads: SourcingLead[] = [
  {
    id: "maden-md2401038",
    company: "MADEN",
    title: "Retro German Trainer · MD2401038",
    country: "China",
    kind: "independent",
    purchase: "single",
    url: "https://www.maden365.com/products/men-s-retro-german-trainer-low-top-sneakers-for-casual-wear-maden",
    companyUrl: "https://www.maden365.com/pages/about-us",
    image:
      "https://www.maden365.com/cdn/shop/files/1_08be65a6-95c4-43dc-880b-c1f170969bee.webp?v=1784024675&width=900",
    unitPrice: 56.99,
    currency: "USD",
    priceNote: "Observed item price; import charges extra.",
    minimumOrder: 1,
    minimumOrderNote: "Single-pair quantity control observed.",
    sizes: "38–45 shown; confirm size chart and stock",
    differences:
      "Own-brand GAT design with navy accents; paneling and branding differ from the white Margiela target.",
    shipping:
      "Direct shipping to most countries. Policy says free over $49 and 7–20 business days; confirm US service and duties.",
    shippingUrl: "https://www.maden365.com/pages/shipping-policy",
    access: "page_checked",
    evidence: [
      {
        text: "Store says it started in Chongqing in 2011.",
        url: "https://www.maden365.com/pages/about-us",
        basis: "Seller claim",
      },
      {
        text: "30-day return policy; customer normally pays return freight.",
        url: "https://www.maden365.com/products/men-s-retro-german-trainer-low-top-sneakers-for-casual-wear-maden",
        basis: "Published policy",
      },
    ],
    gaps: [
      "Independent seller transaction history unavailable.",
      "Product review count is not seller sales history; size-level stock unverified.",
    ],
  },
  {
    id: "novesta-white-ecru",
    company: "NOVESTA Japan",
    title: "German Trainer White/Ecru",
    country: "Japan",
    kind: "independent",
    purchase: "single",
    url: "https://novesta.jp/en/products/german-trainer-white-ecru",
    companyUrl: "https://novesta.jp/en/pages/legal-notice",
    image:
      "https://novesta.jp/cdn/shop/products/147362805.png?v=1637725617&width=1946",
    unitPrice: 36300,
    currency: "JPY",
    priceNote: "Observed Japanese-store price; no currency conversion assumed.",
    minimumOrder: 1,
    minimumOrderNote: "Single-pair retail page; verify selected size.",
    sizes: "EU 36–45 shown",
    differences:
      "Own-brand white/ecru GAT. Made in Slovakia; not a Margiela-branded replica.",
    shipping:
      "Japan storefront offers direct DHL or Buyee. US direct shipping lists $49 below 1.5 kg, $89 at 1.5–3 kg; packed weight and import charges unknown.",
    shippingUrl: "https://novesta.jp/en/pages/shipping-policy",
    access: "page_checked",
    evidence: [
      {
        text: "Store publishes a legal notice and shipping terms.",
        url: "https://novesta.jp/en/pages/legal-notice",
        basis: "Page observation",
      },
    ],
    gaps: [
      "No independently verified seller sales count.",
      "Displayed reviews span colorways; selected-size inventory not confirmed.",
    ],
  },
  {
    id: "playershoes-617336875986",
    company: "Playershoes · attributed",
    title: "Margiela GAT replica lead",
    country: "China",
    kind: "replica_lead",
    purchase: "unconfirmed",
    url: "https://item.taobao.com/item.htm?id=617336875986",
    companyUrl: "https://item.taobao.com/item.htm?id=617336875986",
    unitPrice: null,
    currency: "USD",
    priceNote:
      "Current price unavailable. Historical community prices are not imported.",
    minimumOrder: null,
    minimumOrderNote: "Order quantity and current seller identity unverified.",
    sizes: "Unknown",
    differences:
      "Community-attributed Margiela replica; current branding, construction and variant cannot be checked.",
    shipping:
      "Taobao lead. Confirm a buying agent accepts this exact item and obtain warehouse, international-shipping and fee quotes.",
    shippingUrl: "https://item.taobao.com/item.htm?id=617336875986",
    access: "community_only",
    evidence: [
      {
        text: "Community posts attribute this item ID to Playershoes GATs; the Taobao page could not be read.",
        url: "https://www.reddit.com/r/FashionReps/comments/19boojf/",
        basis: "Community report",
      },
    ],
    gaps: [
      "Unverified seller identity, current stock, price and fulfillment history.",
      "A forum recommendation is not a factory or quality verification.",
    ],
  },
  {
    id: "huajin-german-trainer",
    company: "Foshan Huajin Footwear",
    title: "Custom German Trainer · women's",
    country: "China",
    kind: "factory",
    purchase: "bulk",
    url: "https://www.made-in-china.com/showroom/16cd2ba48b79eb3d/product-detailaPfUpsuGTmhW/China-Custom-OEM-ODM-Women-s-German-Trainer-Sneakers-Casual-Shoes.html",
    companyUrl: "https://www.made-in-china.com/showroom/16cd2ba48b79eb3d/",
    image:
      "https://image.made-in-china.com/155f0j00HtcsiwdrEIqP/Custom-OEM-ODM-Women-s-German-Trainer-Sneakers-Casual-Shoes.webp",
    unitPrice: 23,
    currency: "USD",
    priceNote:
      "Split-leather/suede tier; full-grain version starts at $28. Quote depends on materials and quantity.",
    minimumOrder: 100,
    minimumOrderNote: "100-pair minimum shown; sample price unknown.",
    sizes: "Women's listing; confirm size range",
    differences:
      "Factory GAT-style design. Women's fit and material tier differ; not proof of Margiela production.",
    shipping:
      "Guangzhou export port and T/T terms listed. Freight, samples, import charges and buyer protection need a written quote.",
    shippingUrl: "https://www.made-in-china.com/showroom/16cd2ba48b79eb3d/",
    access: "page_checked",
    evidence: [
      {
        text: "Platform profile lists a Foshan address and Manufacturer/Factory business type.",
        url: "https://www.made-in-china.com/showroom/16cd2ba48b79eb3d/",
        basis: "Seller claim",
      },
    ],
    gaps: [
      "Independent transactions and factory audit unavailable.",
      "Claimed 20-year experience does not establish this newer company's age.",
    ],
  },
  {
    id: "bona-mesh-german-trainer",
    company: "Quanzhou Bona Shoe Industry",
    title: "Mesh Retro German Trainer · OEM/ODM",
    country: "China",
    kind: "factory",
    purchase: "bulk",
    url: "https://www.bonashoes.com/product-catalog/mesh-breathable-retro-trainer-sneakers-oem-odm-footwear-manufacturer-2/",
    companyUrl: "https://www.bonashoes.com/",
    unitPrice: null,
    currency: "USD",
    priceNote: "Quote required; sample cost not published.",
    minimumOrder: 300,
    minimumOrderNote: "300 pairs per color; samples advertised.",
    sizes: "EU 36–41 shown",
    differences:
      "Mesh forefoot and GAT-style paneling; material differs from the leather/suede target.",
    shipping:
      "Factory quote route from Fujian. Obtain sample, payment-protection and freight terms; a consumer shipper is not automatically included.",
    shippingUrl:
      "https://www.bonashoes.com/product-catalog/mesh-breathable-retro-trainer-sneakers-oem-odm-footwear-manufacturer-2/",
    access: "page_checked",
    evidence: [
      {
        text: "Product page publishes MOQ, sample timing and a Quanzhou address.",
        url: "https://www.bonashoes.com/product-catalog/mesh-breathable-retro-trainer-sneakers-oem-odm-footwear-manufacturer-2/",
        basis: "Seller claim",
      },
    ],
    gaps: [
      "Factory capacity and fulfillment claims not independently audited.",
      "No verified seller review or transaction counts.",
    ],
  },
  {
    id: "xufan-german-trainers",
    company: "Jing County XuFan Footwear",
    title: "German Trainers · manufacturer catalog",
    country: "China",
    kind: "factory",
    purchase: "bulk",
    url: "https://xufanshoes.com/products/german-trainers/",
    companyUrl: "https://xufanshoes.com/",
    unitPrice: null,
    currency: "USD",
    priceNote: "Quote required. Catalog lead, not a retail offer.",
    minimumOrder: 500,
    minimumOrderNote:
      "GAT section says 500 pairs; general FAQ says 500–1,000 per style.",
    sizes: "Custom range; confirm sample",
    differences:
      "Leather/suede GAT-style catalog. Exact materials, tooling and dimensions require a sample.",
    shipping:
      "Homepage advertises FOB, CIF and DDP worldwide. Confirm the actual quote, charges and terms.",
    shippingUrl: "https://xufanshoes.com/",
    access: "index_only",
    evidence: [
      {
        text: "Homepage lists German Trainers, an Anhui address and sampling. Linked catalog page timed out.",
        url: "https://xufanshoes.com/",
        basis: "Page observation",
      },
    ],
    gaps: [
      "Certification and factory claims not independently validated.",
      "No verified transaction record or single-pair offer.",
    ],
  },
  {
    id: "huangxuan-hxca237",
    company: "Hangzhou Huangxuan Trading",
    title: "German Training Shoes · HXCA237",
    country: "China",
    kind: "factory",
    purchase: "bulk",
    url: "https://www.mychonly.com/oem-shoes/german-training-shoes.html",
    companyUrl: "https://www.mychonly.com/",
    unitPrice: null,
    currency: "USD",
    priceNote:
      "Quote required. Direct page unreadable; details come from its search index.",
    minimumOrder: null,
    minimumOrderNote:
      "Conflicting minimum: 600 pairs in specifications, 300 for custom designs. Confirm before comparing.",
    sizes: "EU 36–46 indexed",
    differences:
      "Custom GAT-style shoe; indexed specs list leather upper, PU lining and rubber sole.",
    shipping:
      "Factory/trading-company inquiry route; freight, samples and delivered cost unverified.",
    shippingUrl:
      "https://www.mychonly.com/oem-shoes/german-training-shoes.html",
    access: "index_only",
    evidence: [
      {
        text: "Indexed seller product page names HXCA237 and describes customization.",
        url: "https://www.mychonly.com/oem-shoes/german-training-shoes.html",
        basis: "Seller claim",
      },
    ],
    gaps: [
      "MOQ is inconsistent; direct page could not be validated.",
      "Manufacturer status and seller history remain unverified.",
    ],
  },
];

export function leadsForQuery(query: string) {
  return isGatQuery(query) ? gatLeads : [];
}
export type SourcingFilter = "single" | "replica_lead" | "factory" | "all";
export function filterLeads(
  leads: SourcingLead[],
  filter: SourcingFilter,
  country: string,
) {
  return leads.filter(
    (lead) =>
      (country === "all" || lead.country === country) &&
      (filter === "all" ||
        (filter === "single"
          ? lead.purchase === "single"
          : lead.kind === filter)),
  );
}
export function minimumGoodsCost(lead: SourcingLead) {
  return lead.unitPrice !== null && lead.minimumOrder !== null
    ? Math.round(lead.unitPrice * lead.minimumOrder * 100) / 100
    : null;
}
