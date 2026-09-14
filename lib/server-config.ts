import { env } from "cloudflare:workers";
export function config(name: string): string {
  return String(
    (env as Record<string, unknown>)[name] ?? process.env[name] ?? "",
  ).trim();
}
export function connections() {
  return {
    ebay:
      !!config("EBAY_ACCESS_TOKEN") ||
      !!(config("EBAY_CLIENT_ID") && config("EBAY_CLIENT_SECRET")),
    search: !!config("BRAVE_SEARCH_API_KEY"),
    poshmark: config("POSHMARK_PUBLIC_SEARCH") !== "false",
    vision: !!config("OPENAI_API_KEY"),
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new Error("Cross-origin requests are not allowed");
}
export async function readJson(request: Request, maxBytes = 16000) {
  sameOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Expected JSON");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new Error("Request is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body required");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("Request is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
