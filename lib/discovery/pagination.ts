import { z } from "zod";
import type { SearchInput } from "./types.ts";
import { intentFields, type ItemIntent } from "../item-intent.ts";

export const cursorSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    sources: z
      .object({
        ebay: z
          .object({ offset: z.number().int().min(0).max(9990).multipleOf(30) })
          .strict()
          .optional(),
        brave: z
          .object({
            queue: z
              .array(
                z
                  .object({
                    groupId: z.number().int().min(0).max(2),
                    offset: z.number().int().min(0).max(9),
                  })
                  .strict(),
              )
              .min(1)
              .max(3),
            limited: z.boolean().optional(),
            unknown: z.boolean().optional(),
          })
          .strict()
          .optional(),
        poshmark: z
          .object({
            maxId: z
              .string()
              .min(1)
              .max(2048)
              .regex(/^[A-Za-z0-9_+=/.-]+$/)
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type Continuation = z.infer<typeof cursorSchema>;
export type SourceCursors = Continuation["sources"];
export type Coverage =
  | "more"
  | "exhausted"
  | "provider_limit"
  | "blocked"
  | "unknown";

export async function searchScope(
  input: SearchInput,
  fields: Partial<ItemIntent["fields"]>,
) {
  const value = JSON.stringify([
    1,
    input.query.trim().toLowerCase(),
    input.lane,
    intentFields.map((key) => [
      key,
      Object.hasOwn(fields, key),
      fields[key] ?? null,
    ]),
    input.imageBase64 ?? null,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
