import type { Listing } from "./finder-types.ts";

export const intentFields = [
  "brand",
  "model",
  "styleCode",
  "finish",
  "size",
  "category",
  "material",
  "season",
  "color",
  "silhouette",
] as const;
export type IntentField = (typeof intentFields)[number];
export type ItemIntent = {
  query: string;
  fields: Record<IntentField, string | null>;
  origins: Partial<Record<IntentField, "query" | "user_confirmed">>;
};
export type MatchAssessment = {
  version: "identity-v1";
  kind: "code_match" | "model_match" | "variant_mismatch" | "unverified";
  label: string;
  rank: number;
  reasons: string[];
  missing: string[];
};
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const code = (s: string) => normalize(s).replace(/[^a-z0-9]/g, "");

export function isGatQuery(query: string) {
  const q = normalize(query);
  if (/\btabi\b|\bfusion\b|\bfuture\b|\bretro\s+fit\b|タビ/.test(q))
    return false;
  return (
    /\bgats?\b|german\s+(?:army\s+)?trainers?|ジャーマントレーナー|德训鞋/.test(
      q,
    ) ||
    (/\bmarg(?:iela|ella|iella)\b|マルジェラ/.test(q) &&
      /\breplica\b.*\b(?:sneakers?|shoes?)\b/.test(q))
  );
}

/** Deterministic parsing of explicit words, not visual recognition or authentication. */
export function parseIntent(
  query: string,
  overrides: Partial<Record<IntentField, string | null>> = {},
): ItemIntent {
  const q = normalize(query);
  const fields = Object.fromEntries(
    intentFields.map((f) => [f, null]),
  ) as ItemIntent["fields"];
  if (/\brick\s+ow(?:ens?|ns)\b|\bdrkshdw\b|リック.?オウエンス/i.test(q))
    fields.brand = "Rick Owens";
  else if (/\bmarg(?:iela|ella|iella)\b|マルジェラ/.test(q))
    fields.brand = "Maison Margiela";
  else {
    const brand = [
      "Maison Margiela",
      "Comme des Garcons",
      "Issey Miyake",
      "Acne Studios",
      "Balenciaga",
      "Yohji Yamamoto",
      "Nike",
      "Adidas",
      "Levi's",
      "Carhartt",
    ].find((b) => q.includes(normalize(b)));
    if (brand) fields.brand = brand;
  }
  if (
    /\bbias\b|バイアス|偏裁/.test(q) &&
    /bootcut|jeans|denim|ブーツカット|デニム|牛仔|微喇/.test(q)
  )
    fields.model = "Bias Bootcut";
  else if (/\bbolan\b/.test(q)) fields.model = "Bolan Bootcut";
  else if (/\bramones\b/.test(q)) fields.model = "Ramones";
  else if (isGatQuery(q)) fields.model = "German Army Trainer";
  fields.styleCode =
    query
      .match(/\b(?:DU|RU|RR|DS)\d{2}[A-Z]\d{4}(?:-[A-Z0-9]{2,15})*\b/i)?.[0]
      .toUpperCase() ?? null;
  fields.styleCode ??=
    query.match(/\bS\d{2}WS\d{4}P\d{4}[A-Z0-9]{3,8}\b/i)?.[0].toUpperCase() ??
    null;
  if (/degrad[eé]?|gradient|ombr[eé]|渐变|グラデーション/.test(q))
    fields.finish = "Degrade";
  else if (/\bwax(?:ed)?\b|涂层/.test(q)) fields.finish = "Wax";
  fields.size = query.match(/\b(?:W|waist[ :]*)(\d{2})\b/i)?.[1] ?? null;
  if (isGatQuery(q)) {
    const shoeSize = query.match(/\b(EU|US|UK)\s?(\d{1,2}(?:\.5)?)\b/i);
    fields.size = shoeSize
      ? `${shoeSize[1].toUpperCase()} ${shoeSize[2]}`
      : null;
  }
  if (/jeans|denim|牛仔|デニム/.test(q)) fields.category = "Jeans";
  else if (/boots?\b/.test(q)) fields.category = "Boots";
  else if (/sneakers?|trainers/.test(q) || isGatQuery(q))
    fields.category = "Sneakers";
  else if (/jacket|blazer/.test(q)) fields.category = "Jacket";
  else if (/\bdress\b/.test(q)) fields.category = "Dress";
  if (/denim|牛仔|デニム/.test(q)) fields.material = "Denim";
  else if (/leather/.test(q)) fields.material = "Leather";
  else if (/cotton/.test(q)) fields.material = "Cotton";
  fields.season =
    query.match(/\b(?:SS|FW|AW)[ -]?\d{2,4}\b/i)?.[0].toUpperCase() ?? null;
  const colors = [
    "black",
    "pearl",
    "white",
    "blue",
    "red",
    "brown",
    "cream",
    "beige",
    "grey",
    "gray",
  ].filter((c) => new RegExp(`\\b${c}\\b`).test(q));
  if (colors.length) fields.color = colors.join(" / ");
  if (/bootcut|ブーツカット|微喇/.test(q)) fields.silhouette = "Bootcut";
  else if (/flare|flared|喇叭/.test(q)) fields.silhouette = "Flared";
  const origins: ItemIntent["origins"] = {};
  for (const field of intentFields) {
    if (fields[field]) origins[field] = "query";
    if (overrides[field] !== undefined) {
      fields[field] = overrides[field]?.trim() || null;
      origins[field] = "user_confirmed";
    }
  }
  return { query, fields, origins };
}

export function assessMatch(
  intent: ItemIntent,
  listing: Listing,
): MatchAssessment {
  const candidate = parseIntent(
    `${listing.title} ${listing.size === "Not specified" ? "" : listing.size}`,
  );
  const reasons: string[] = [],
    missing: string[] = [],
    mismatches: string[] = [];
  let rank = 0;
  for (const field of intentFields) {
    const wanted = intent.fields[field];
    if (!wanted) continue;
    const found = candidate.fields[field];
    if (!found) {
      missing.push(field);
      continue;
    }
    const equal =
      field === "styleCode"
        ? code(wanted) === code(found)
        : normalize(wanted) === normalize(found);
    if (equal) {
      rank += field === "styleCode" ? 60 : field === "model" ? 20 : 5;
      reasons.push(`${field}: ${found}`);
    } else {
      mismatches.push(`${field}: wanted ${wanted}; title indicates ${found}`);
    }
  }
  if (mismatches.length)
    return {
      version: "identity-v1",
      kind: "variant_mismatch",
      label: "Details differ",
      rank: -10,
      reasons: mismatches,
      missing,
    };
  const codeMatches =
    !!intent.fields.styleCode &&
    !!candidate.fields.styleCode &&
    code(intent.fields.styleCode) === code(candidate.fields.styleCode);
  const modelMatches =
    !!intent.fields.model &&
    normalize(intent.fields.model) ===
      normalize(candidate.fields.model ?? "") &&
    !!intent.fields.brand &&
    normalize(intent.fields.brand) === normalize(candidate.fields.brand ?? "");
  return {
    version: "identity-v1",
    kind: codeMatches
      ? "code_match"
      : modelMatches
        ? "model_match"
        : "unverified",
    label: codeMatches
      ? "Style code matches"
      : modelMatches
        ? "Model words match"
        : "Match unverified",
    rank,
    reasons: reasons.length
      ? reasons
      : ["Not enough item information in the title."],
    missing,
  };
}

export function queryVariants(intent: ItemIntent) {
  const result = [
    { language: "en", text: intent.query, reason: "Original title" },
  ];
  if (intent.fields.styleCode)
    result.push({
      language: "en",
      text: `${intent.fields.brand ?? ""} ${intent.fields.styleCode}`.trim(),
      reason: "Style code",
    });
  if (intent.fields.model === "German Army Trainer") {
    result.push({
      language: "en",
      text: "German army trainer leather suede gum sole",
      reason: "Similar-design supplier search",
    });
    result.push({
      language: "zh",
      text: "德训鞋 真皮 麂皮 生胶底",
      reason: "Chinese GAT design terms",
    });
    result.push({
      language: "ja",
      text: "ジャーマントレーナー レザー スエード ガムソール",
      reason: "Japanese GAT design terms",
    });
  }
  if (
    intent.fields.brand === "Rick Owens" &&
    intent.fields.category === "Jeans"
  ) {
    result.push({
      language: "ja",
      text: `リックオウエンス ${intent.fields.model === "Bias Bootcut" ? "バイアス ブーツカット " : ""}デニム${intent.fields.finish === "Degrade" ? " グラデーション" : ""}`,
      reason: "Japanese search hypothesis",
    });
    result.push({
      language: "zh",
      text: `Rick Owens ${intent.fields.model === "Bias Bootcut" ? "偏裁 微喇 " : ""}牛仔裤${intent.fields.finish === "Degrade" ? " 渐变" : ""}${intent.fields.finish === "Wax" ? " 涂层" : ""}`,
      reason: "Chinese search hypothesis",
    });
  }
  return result;
}
