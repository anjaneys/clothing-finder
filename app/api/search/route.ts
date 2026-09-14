import { z } from "zod";
import { readJson } from "@/lib/server-config";
import { searchSources } from "@/lib/search-providers";
import { intentFields } from "@/lib/item-intent";

const schema = z
  .object({
    query: z.string().trim().min(2).max(180),
    lane: z.enum(["legit", "reps"]),
    fields: z
      .object(
        Object.fromEntries(
          intentFields.map((field) => [
            field,
            z.string().trim().max(100).nullable().optional(),
          ]),
        ),
      )
      .strict()
      .optional(),
    image: z
      .string()
      .max(7_000_000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  let raw;
  try {
    raw = await readJson(request, 7_100_000);
  } catch {
    return Response.json(
      { error: "Send same-origin JSON within the 7 MB request limit." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Enter 2–180 characters, a valid lane, and optional target fields or a JPG, PNG or WebP photo.",
      },
      { status: 400 },
    );
  const { query, lane, fields, image } = parsed.data;
  const imageBase64 = image?.split(",")[1];
  if (
    imageBase64 &&
    (lane !== "legit" ||
      imageBase64.length % 4 !== 0 ||
      (imageBase64.length * 3) / 4 -
        (imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0) >
        5 * 1024 * 1024)
  )
    return Response.json(
      { error: "Photo search supports Legit and images up to 5 MB." },
      { status: 400 },
    );
  const body = await searchSources(
    { query, lane, imageBase64, signal: request.signal },
    fields ?? {},
  );
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
