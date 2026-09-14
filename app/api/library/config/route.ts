import { config } from "@/lib/server-config";
import { publicCloudConfig } from "@/lib/library/model";
export function GET() {
  const cloud = publicCloudConfig(
    config("SUPABASE_URL"),
    config("SUPABASE_PUBLISHABLE_KEY"),
  );
  return Response.json(
    {
      configured: !!cloud,
      ...cloud,
      storagePolicy: {
        ebay: config("EBAY_STORAGE_ALLOWED") === "true",
        brave: config("BRAVE_STORAGE_ALLOWED") === "true",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
