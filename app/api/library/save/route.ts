import { config, readJson } from "@/lib/server-config";
import {
  publicCloudConfig,
  prepareStorage,
  saveSchema,
} from "@/lib/library/model";
import { z } from "zod";
export async function POST(request: Request) {
  const cloud = publicCloudConfig(
    config("SUPABASE_URL"),
    config("SUPABASE_PUBLISHABLE_KEY"),
  );
  if (!cloud)
    return Response.json(
      { error: "Connect a hosted Supabase project to save data." },
      { status: 503 },
    );
  const token = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_.-]{30,8000}$/.test(token))
    return Response.json(
      { error: "Sign in to your library first." },
      { status: 401 },
    );
  let raw;
  try {
    raw = await readJson(request, 2_000_000);
  } catch {
    return Response.json(
      { error: "Send same-origin JSON within 2 MB." },
      { status: 400 },
    );
  }
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      {
        error: "Invalid search snapshot. Save at most 100 listings per batch.",
      },
      { status: 400 },
    );
  const { runId, query, lane, fields, listings, sources } = parsed.data;
  const prepared = prepareStorage(listings, lane, {
    ebay: config("EBAY_STORAGE_ALLOWED") === "true",
    brave: config("BRAVE_STORAGE_ALLOWED") === "true",
  });
  if (!prepared.snapshots.length)
    return Response.json(
      { saved: 0, skipped: prepared.skipped, searchId: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const response = await fetch(`${cloud.url}/rest/v1/rpc/cf_save_search`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      headers: {
        apikey: cloud.publishableKey,
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_run_id: runId,
        p_query: query,
        p_lane: lane,
        p_fields: fields,
        p_snapshots: prepared.snapshots,
        p_sources: sources,
      }),
    });
    if (!response.ok)
      return Response.json(
        {
          error:
            response.status === 401 || response.status === 403
              ? "Sign in again to access your private library."
              : "The cloud save failed. Check the database migration and connection; you can retry without duplicating records.",
        },
        {
          status:
            response.status === 401 || response.status === 403 ? 401 : 502,
        },
      );
    const result = z
      .object({
        saved: z.number().int().nonnegative(),
        searchId: z.string().uuid(),
      })
      .parse(await response.json());
    return Response.json(
      { ...result, skipped: prepared.skipped },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "The cloud database did not respond. Your session results are still here; retry saving.",
      },
      { status: 502 },
    );
  }
}
