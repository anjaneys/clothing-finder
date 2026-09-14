import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:5173";
const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const status = await (await fetch(base + "/api/status")).json();
const cloud = await (await fetch(base + "/api/library/config")).json();
assert.equal(typeof cloud.configured, "boolean");
assert.equal(typeof cloud.storagePolicy.ebay, "boolean");
assert.equal(typeof cloud.storagePolicy.brave, "boolean");
assert.ok(!("secretKey" in cloud));
if (!cloud.configured) {
  assert.ok(!("publishableKey" in cloud));
  assert.equal((await post("/api/library/save", {})).status, 503);
} else {
  assert.equal((await post("/api/library/save", {})).status, 401);
}
assert.deepEqual(Object.keys(status).sort(), [
  "ebay",
  "poshmark",
  "search",
  "vision",
]);
let response = await post("/api/search", {
  query: "Rick Owens bias bootcut jeans",
  lane: "legit",
  fields: { finish: "Degrade", size: null },
});
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "no-store");
let body = await response.json();
assert.ok(Array.isArray(body.listings));
assert.equal(body.run.sources.length, 3);
assert.equal(body.intent.fields.finish, "Degrade");
assert.equal(body.intent.fields.size, null);
if (!status.ebay && !status.search && !status.poshmark) {
  assert.equal(body.mode, "links");
  assert.equal(body.listings.length, 0);
  assert.ok(
    body.run.sources.every((source) => source.state === "not_configured"),
  );
}
for (const input of [
  { query: "x", lane: "legit" },
  { query: "   ", lane: "legit" },
  { query: "Rick Owens", lane: "invalid" },
  { query: "Rick Owens", lane: "legit", fields: { brand: "x".repeat(101) } },
  { query: "Rick Owens", lane: "legit", fields: { injected: "ignored" } },
  {
    query: "Rick Owens",
    lane: "legit",
    image: "https://untrusted.example/image.png",
  },
  {
    query: "Rick Owens",
    lane: "reps",
    image: "data:image/png;base64,aGVsbG8=",
  },
]) {
  assert.equal((await post("/api/search", input)).status, 400);
}
response = await post("/api/search", {
  query: "unrelated sneaker test",
  lane: "legit",
});
body = await response.json();
if (!status.ebay && !status.search && !status.poshmark)
  assert.equal(body.listings.length, 0);
response = await post("/api/search", {
  query: "Maison Margiela GAT sneakers",
  lane: "legit",
});
body = await response.json();
if (!status.ebay && !status.search && !status.poshmark) {
  assert.equal(body.listings.length, 0);
  assert.ok(
    body.run.sources.every((source) => source.state === "not_configured"),
  );
}
assert.ok(body.listings.every((listing) => listing.source !== "research"));
response = await post("/api/search", {
  query: "Rick Owens bias bootcut jeans",
  lane: "reps",
});
body = await response.json();
assert.equal(body.run.sources[0].state, "not_applicable");
if (!status.search) {
  assert.equal(body.mode, "links");
  assert.equal(body.listings.length, 0);
}
response = await post(
  "/api/search",
  { query: "Rick Owens", lane: "legit" },
  { Origin: "https://untrusted.example" },
);
assert.ok([400, 403].includes(response.status));
response = await post("/api/identify", {
  image: "https://untrusted.example/image.png",
});
assert.equal(response.status, 400);
if (!status.vision) {
  response = await post("/api/identify", {
    image: "data:image/png;base64,aGVsbG8=",
  });
  assert.equal(response.status, 503);
}
console.log(
  "API smoke checks passed: per-source states, no automatic snapshots, target fields, empty results, invalid inputs, origin boundary and image setup.",
);
