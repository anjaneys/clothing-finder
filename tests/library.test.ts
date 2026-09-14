import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  prepareStorage,
  publicCloudConfig,
  previewStats,
  type StoredSnapshot,
} from "../lib/library/model.ts";
import { exportRows } from "../lib/library/client.ts";
import { unknownEvidence, type Listing } from "../lib/finder-types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const ownerA = "00000000-0000-4000-8000-000000000001",
  ownerB = "00000000-0000-4000-8000-000000000002";
const runA = "00000000-0000-4000-8000-000000000101",
  runB = "00000000-0000-4000-8000-000000000102",
  runC = "00000000-0000-4000-8000-000000000103";
const fixture = (n = 1, overrides: Partial<Listing> = {}): Listing => ({
  id: `fixture-${n}`,
  sourceId: "poshmark",
  sourceItemId: n.toString(16).padStart(24, "0"),
  title: `Maison Margiela GAT ${n}`,
  platform: "Poshmark",
  url: `https://poshmark.com/listing/Margiela-GAT-${n.toString(16).padStart(24, "0")}`,
  price: 100,
  currency: "USD",
  shipping: null,
  size: "EU 42",
  condition: "Used",
  lane: "legit",
  seller: "fixture-seller",
  evidence: { ...unknownEvidence },
  availability: "available",
  match: "related",
  source: "live",
  provenance: "public_page",
  checkedAt: "2026-09-13T12:00:00.000Z",
  notes: "Synthetic test record",
  authenticity: "Unverified",
  ...overrides,
});
const snapshot = (n = 1, overrides: Partial<Listing> = {}): StoredSnapshot =>
  prepareStorage([fixture(n, overrides)], overrides.lane ?? "legit", {
    ebay: false,
    brave: false,
  }).snapshots[0];

test("cloud key configuration exposes only hosted project URL and publishable/anon keys", () => {
  assert.deepEqual(
    publicCloudConfig("https://example.supabase.co", "sb_publishable_fixture"),
    {
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_fixture",
    },
  );
  for (const key of [
    "sb_secret_fixture",
    `x.${btoa(JSON.stringify({ role: "service_role" }))}.x`,
    "mongodb+srv://secret",
  ])
    assert.equal(publicCloudConfig("https://example.supabase.co", key), null);
  for (const url of [
    "http://localhost:54321",
    "https://example.supabase.co.evil.test",
    "https://user:pass@example.supabase.co",
    "https://example.supabase.co/?key=secret",
  ])
    assert.equal(publicCloudConfig(url, "sb_publishable_fixture"), null);
  assert.ok(
    publicCloudConfig(
      "https://example.supabase.co",
      `x.${btoa(JSON.stringify({ role: "anon" }))}.x`,
    ),
  );
});

test("storage preserves unknown/zero and negative feedback, and strips account/photo/cursor extras", () => {
  const input = {
    ...fixture(),
    imageBase64: "secret-image",
    continuation: { next: "secret-cursor" },
    access_token: "secret-token",
    sellerRecord: { id: "invented-permanent-id" },
  };
  const result = prepareStorage([input], "legit", {
    ebay: false,
    brave: false,
  });
  assert.equal(result.snapshots.length, 1);
  const serialized = JSON.stringify(result.snapshots);
  assert.doesNotMatch(serialized, /secret-|invented-permanent-id|sellerRecord/);
  assert.equal(result.snapshots[0].listing.evidence.sold, null);
  assert.equal(result.snapshots[0].listing.shipping, null);
  assert.equal(
    snapshot(2, {
      shipping: 0,
      evidence: { ...unknownEvidence, sold: 0, active: 0, feedbackScore: -2 },
    }).listing.evidence.feedbackScore,
    -2,
  );
  assert.equal(
    prepareStorage(
      [fixture(1, { image: "data:image/png;base64,AAAA" })],
      "legit",
      { ebay: false, brave: false },
    ).skipped.invalid,
    1,
  );
  assert.equal(
    prepareStorage([fixture(1, { lane: "reps" })], "legit", {
      ebay: false,
      brave: false,
    }).skipped.lane,
    1,
  );
});

test("provider storage opt-ins are respected without relabelling excluded data", () => {
  const rows = [
    fixture(1, { provenance: "indexed_page" }),
    fixture(2, { platform: "eBay", provenance: "live_api" }),
  ];
  assert.equal(
    prepareStorage(rows, "legit", { ebay: false, brave: false }).skipped.policy,
    2,
  );
  assert.equal(
    prepareStorage(rows, "legit", { ebay: true, brave: true }).snapshots.length,
    2,
  );
});

test("preview charts keep currencies/lanes separate and price/trust unknowns explicit", () => {
  const rows = [
    fixture(1),
    fixture(2, { price: 0 }),
    fixture(3, { price: null }),
    fixture(4, { price: 999, currency: "EUR" }),
    fixture(5, { price: 888, lane: "reps" }),
  ];
  const { stats } = previewStats(rows, {
    searchId: null,
    lane: "legit",
    currency: "USD",
    platform: "",
    text: "",
  });
  assert.equal(stats.total, 3);
  assert.equal(stats.priced, 2);
  assert.equal(stats.missingPrice, 1);
  assert.equal(stats.min, 0);
  assert.equal(stats.max, 100);
  assert.equal(stats.unknownTrust, 3);
});

test("hosted schema: isolation, idempotency, append-only history, atomic imports and paginated analytics", async (t) => {
  const db = new PGlite(); // Test-only PostgreSQL in RAM. No filesystem or IndexedDB database.
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609140001_library.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users values ($1),($2)", [ownerA, ownerB]);
    const asUser = async (owner: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        owner,
      ]);
      await db.exec("set role authenticated");
    };
    const save = async (
      run: string,
      rows: StoredSnapshot[],
      query = "Margiela GAT",
      lane = "legit",
    ) =>
      (
        await db.query<{ result: { searchId: string; saved: number } }>(
          "select public.cf_save_search($1,$2,$3,'{}'::jsonb,$4::jsonb,'[]'::jsonb) result",
          [run, query, lane, JSON.stringify(rows)],
        )
      ).rows[0].result;
    let searchId = "";
    await t.test(
      "duplicate save is idempotent and nulls survive round-trip",
      async () => {
        await asUser(ownerA);
        const first = await save(runA, [snapshot()]);
        searchId = first.searchId;
        assert.equal(first.saved, 1);
        assert.equal((await save(runA, [snapshot()])).saved, 0);
        const row = (
          await db.query<{ snapshot: StoredSnapshot; price: string }>(
            "select snapshot,price from public.cf_listing_observations",
          )
        ).rows[0];
        assert.equal(row.snapshot.listing.shipping, null);
        assert.equal(row.snapshot.listing.evidence.sold, null);
        assert.equal(Number(row.price), 100);
      },
    );
    await t.test("cross-user reads and owner spoofing are denied", async () => {
      await asUser(ownerB);
      assert.equal(
        (await db.query("select * from public.cf_saved_searches")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.cf_listing_observations")).rows
          .length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into public.cf_search_runs(id,owner_id,search_id) values($1,$2,$3)",
          [runB, ownerB, searchId],
        ),
      );
      await assert.rejects(
        db.query(
          "insert into public.cf_search_runs(id,owner_id,search_id) values($1,$2,$3)",
          [runB, ownerA, searchId],
        ),
      );
      await assert.rejects(save(runA, [snapshot(2)]));
      assert.equal(
        (await db.query("select * from public.cf_saved_searches")).rows.length,
        0,
      ); // Failed RPC rolled back its new search too.
      await asUser(ownerA);
    });
    await t.test("invalid later row rolls back the entire batch", async () => {
      const invalid = structuredClone(snapshot(3));
      (invalid.listing as unknown as { price: string }).price = "NaN";
      await assert.rejects(save(runB, [snapshot(2), invalid]));
      assert.equal(
        (await db.query("select * from public.cf_listing_observations")).rows
          .length,
        1,
      );
      assert.equal(
        (await db.query("select * from public.cf_search_runs")).rows.length,
        1,
      );
    });
    await t.test(
      "direct RPC rejects photos, null identities and mixed lanes",
      async () => {
        const invalid = structuredClone(snapshot(2));
        invalid.listing.image = "data:image/png;base64,AAAA";
        await assert.rejects(save(runB, [invalid]));
        const nullTitle = structuredClone(snapshot(2));
        (nullTitle.listing as unknown as { title: null }).title = null;
        await assert.rejects(save(runB, [nullTitle]));
        const wrongSize = structuredClone(snapshot(2));
        (wrongSize.listing as unknown as { size: object }).size = {
          invalid: true,
        };
        await assert.rejects(save(runB, [wrongSize]));
        await assert.rejects(
          db.query(
            "insert into public.cf_listing_observations(owner_id,search_id,run_id,snapshot,observed_at) values($1,$2,$3,$4::jsonb,now())",
            [
              ownerA,
              searchId,
              runA,
              JSON.stringify({
                trustScore: null,
                trustCoverage: 0,
                scoringVersion: "seller-v1",
              }),
            ],
          ),
        );
        await assert.rejects(save(runB, [snapshot(2, { lane: "reps" })]));
        await assert.rejects(
          db.exec("select public.cf_library_page(p_limit=>null)"),
        );
        await assert.rejects(
          db.query(
            "select public.cf_save_search($1,'invalid empty','legit','{}'::jsonb,null)",
            [runB],
          ),
        );
      },
    );
    await t.test(
      "run identity cannot be reassigned and observations cannot be edited",
      async () => {
        await assert.rejects(save(runA, [snapshot(2)], "Rick Owens jeans"));
        await assert.rejects(
          db.query(
            "update public.cf_listing_observations set snapshot=$1::jsonb",
            [JSON.stringify(snapshot(1, { price: 5 }))],
          ),
        );
        await assert.rejects(
          db.exec("delete from public.cf_listing_observations"),
        );
      },
    );
    await t.test(
      "later observation wins; a richer older import remains history",
      async () => {
        await save(runB, [
          snapshot(1, { price: 80, checkedAt: "2026-09-14T01:00:00.000Z" }),
        ]);
        await save(runC, [
          snapshot(1, {
            price: 200,
            checkedAt: "2026-09-12T01:00:00.000Z",
            evidence: { ...unknownEvidence, sold: 100, active: 50 },
          }),
        ]);
        const page = (
          await db.query<{ result: { rows: { price: number }[] } }>(
            "select public.cf_library_page() result",
          )
        ).rows[0].result;
        assert.equal(page.rows.length, 1);
        assert.equal(page.rows[0].price, 80);
        assert.equal(
          (await db.query("select * from public.cf_listing_observations")).rows
            .length,
          3,
        );
      },
    );
    await t.test(
      "more than 1000 records are browsable and chart aggregates use all pages",
      async () => {
        for (let start = 2; start <= 1102; start += 100)
          await save(
            runA,
            Array.from({ length: Math.min(100, 1103 - start) }, (_, i) =>
              snapshot(start + i, { price: (start + i) % 300 }),
            ),
          );
        const first = (
          await db.query<{ result: { total: number; rows: { id: string }[] } }>(
            "select public.cf_library_page(p_limit=>200) result",
          )
        ).rows[0].result;
        assert.equal(first.total, 1102);
        assert.equal(first.rows.length, 200);
        const all = new Set<string>();
        for (let offset = 0; offset < first.total; offset += 200) {
          const page = (
            await db.query<{ result: { rows: { id: string }[] } }>(
              "select public.cf_library_page(p_offset=>$1,p_limit=>200) result",
              [offset],
            )
          ).rows[0].result;
          for (const row of page.rows) all.add(row.id);
        }
        assert.equal(all.size, 1102);
        const stats = (
          await db.query<{
            result: { total: number; priced: number; unknownTrust: number };
          }>("select public.cf_library_stats() result")
        ).rows[0].result;
        assert.equal(stats.total, 1102);
        assert.equal(stats.priced, 1102);
        assert.equal(stats.unknownTrust, 1102);
      },
    );
    await t.test(
      "unknown prices, other currencies, and Reps remain separate",
      async () => {
        await save("00000000-0000-4000-8000-000000000104", [
          snapshot(1200, { currency: "EUR", price: 700 }),
          snapshot(1201, { price: null }),
        ]);
        await save(
          "00000000-0000-4000-8000-000000000105",
          [snapshot(1300, { lane: "reps", price: 5 })],
          "Margiela GAT",
          "reps",
        );
        const stats = (
          await db.query<{
            result: { total: number; missingPrice: number; max: number };
          }>("select public.cf_library_stats() result")
        ).rows[0].result;
        assert.equal(stats.total, 1103);
        assert.equal(stats.missingPrice, 1);
        assert.equal(stats.max, 299);
        assert.equal(
          (
            await db.query<{ result: { total: number } }>(
              "select public.cf_library_stats(p_lane=>'reps') result",
            )
          ).rows[0].result.total,
          1,
        );
      },
    );
    await t.test(
      "export cutoff preserves the older latest observation during concurrent saves",
      async () => {
        const cutoff = (
          await db.query<{ cutoff: string }>(
            "select clock_timestamp()::text cutoff",
          )
        ).rows[0].cutoff;
        await save("00000000-0000-4000-8000-000000000106", [
          snapshot(1, { price: 1, checkedAt: "2026-09-14T02:00:00.000Z" }),
        ]);
        const page = (
          await db.query<{ result: { rows: { price: number }[] } }>(
            "select public.cf_library_page(p_text=>'GAT 1',p_before=>$1) result",
            [cutoff],
          )
        ).rows[0].result;
        assert.equal(page.rows[0].price, 80);
      },
    );
    await t.test(
      "delete cascades only the selected owner's search",
      async () => {
        await asUser(ownerB);
        await save("00000000-0000-4000-8000-000000000107", [snapshot(3)]);
        await asUser(ownerA);
        await db.query("delete from public.cf_saved_searches where id=$1", [
          searchId,
        ]);
        assert.equal(
          (
            await db.query(
              "select * from public.cf_listing_observations where search_id=$1",
              [searchId],
            )
          ).rows.length,
          0,
        );
        await asUser(ownerB);
        assert.equal(
          (await db.query("select * from public.cf_listing_observations")).rows
            .length,
          1,
        );
      },
    );
    await t.test(
      "anonymous readers cannot access tables or functions",
      async () => {
        await db.exec("reset role; set role anon;");
        await assert.rejects(db.exec("select * from public.cf_saved_searches"));
        await assert.rejects(db.exec("select public.cf_library_page()"));
      },
    );
  } finally {
    await db.close();
  }
});

test("export helper traverses every page beyond provider default row limits", async () => {
  const offsets: number[] = [];
  const client = {
    rpc: (_name: string, args: { p_offset: number; p_before: string }) => ({
      abortSignal: async () => {
        offsets.push(args.p_offset);
        assert.equal(args.p_before, "fixed-cutoff");
        return {
          error: null,
          data: {
            total: 1205,
            rows: Array.from(
              { length: Math.min(100, 1205 - args.p_offset) },
              (_, i) => ({ id: args.p_offset + i }),
            ),
          },
        };
      },
    }),
  } as unknown as SupabaseClient;
  const rows = await exportRows(
    client,
    { searchId: null, lane: "legit", currency: "USD", platform: "", text: "" },
    "fixed-cutoff",
    new AbortController().signal,
    () => {},
  );
  assert.equal(rows.length, 1205);
  assert.equal(new Set(rows.map((row) => row.id)).size, 1205);
  assert.equal(offsets.at(-1), 1200);
});
