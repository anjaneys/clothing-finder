# Cloud library

Version 0.5 adds a hosted Supabase/PostgreSQL integration and **Library & data** workspace. The code and SQL migration live in GitHub. Saved listing records live in the connected cloud database, not a local database file. Without a configured project, the app offers an explicitly unsaved session preview; it never silently falls back to SQLite, IndexedDB, localStorage, or JSON files.

The integration is implemented and tested against PostgreSQL in memory. **The maintainer's local setup now connects to a provisioned Free Supabase project in East US (North Virginia).** The initial migration was applied through the SQL Editor. All three Library tables have row-level security enabled, and anonymous REST table reads and Library RPC calls were verified denied. The first application user's authenticated save/reload check still requires application sign-in. Other checkouts need their own connection settings; project keys and user details are not included in this repository.

## Connect your project

1. Sign in to the [Supabase dashboard](https://supabase.com/dashboard) and create a project named `clothing-finder` in your organization. Choose a region near you. Use an available Free project if suitable; this implementation does not require upgrading or buying a plan.
2. In that project's SQL Editor, run [the library migration](../supabase/migrations/202609140001_library.sql) once. It creates three tables, indexes, ownership policies and import/read functions in one transaction. Future schema updates should be new migrations; do not repeatedly paste the initial migration into an existing installation.
3. In the project's Connect/API settings, obtain its HTTPS project URL and **publishable** key. A legacy **anon** key also works. Add these to the existing ignored `.env` file without replacing other provider settings:

   ```dotenv
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

   Do not use a secret or `service_role` key. The app rejects those from its browser configuration. The URL and publishable key identify the project; the user's authenticated JWT and row-level security control data access. [Supabase API-key guidance](https://supabase.com/docs/guides/getting-started/api-keys)
4. In Supabase **Authentication → Users → Add user → Create new user**, create an application user with an email and password and leave **Auto confirm user** checked. This sends no invitation or confirmation email. This user is distinct from signing into the Supabase administration dashboard with GitHub. For this personal setup, disable **Allow new users to sign up** under **Authentication → Sign In / Providers**; keep anonymous sign-ins disabled. These private registration settings were applied to the maintainer's project. Enter passwords directly in the user-creation/sign-in screens, not in repository files or chat.
5. Restart the app, open **Library & data**, and sign in with that application user. Run a finder search. Completed results automatically save while the user is signed in unless **Save completed searches automatically** is unchecked. **Save session** retries or explicitly saves the current collection.
6. Switch to **Saved in cloud**. Verify its count and chart totals, reload the app, sign in again, and verify the saved records remain. Authentication tokens stay in tab memory; closing/reloading the tab requires signing in again, but it does not delete cloud records.

The dashboard itself also provides a hosted [Table Editor and SQL Editor](https://supabase.com/docs/guides/database/overview) for reading the underlying tables. Ordinary app users cannot see another user's rows; database administrators remain privileged administrators of their project.

## What is saved

| Table | Purpose |
| --- | --- |
| `cf_saved_searches` | Submitted title, Legit/Reps lane, confirmed target-field overrides and timestamps. The same normalized target reuses its saved search. |
| `cf_search_runs` | Stable collection-run ID and explicit `session_import` origin. Loading another page does not create an unrelated search. |
| `cf_listing_observations` | Immutable listing snapshots with source IDs/URLs, image links, prices/currencies, size, condition, observed availability, seller handle, evidence, corrections, comparison input, match assessment and versioned heuristic score. |

Snapshot hashes make retries idempotent. A later actual observation remains a separate history entry, even when its price is unchanged. The latest view uses observation time, import time and a stable ID tiebreaker, so importing an older rich record does not overwrite a newer price. Multiple saved searches can contain the same listing; **All saved searches** reports listing entries and explains that overlap.

Source handles are not treated as permanent seller IDs, and sellers are not merged across platforms by display name. Unknown seller counts/shipping stay null; observed zero stays zero. An expired observation remains in history but needs rechecking. An item missing from a later search is never automatically marked sold.

Only normalized data is saved. Uploaded reference-photo bytes, image-search payloads, access tokens, provider cursors, raw HTML, and permanent synthesized seller IDs are excluded. Original marketplace image links are retained, not downloaded images. The supplier catalog/research documents remain source-code content; they are not automatically inserted as cloud inventory. Per-source request diagnostics and ongoing continuation state remain session-only in this slice.

## Storage policies

The server checks existing `EBAY_STORAGE_ALLOWED` and `BRAVE_STORAGE_ALLOWED` flags before saving their live API or indexed observations. They default to false. Set a flag only when the provider agreement for your account permits the intended storage; the save result reports excluded rows. Excluded index records are not relabelled as manual observations. Public Poshmark observations, explicit manual entries and selected research records can be saved.

These flags control this application's save path. The owner of a Supabase project can still administer/import their own database directly. This is not a mechanism for enforcing provider contracts against the database administrator.

## Browse and visualize

- Switch between **Session preview** and **Saved in cloud**; connection failure never presents preview rows as saved records.
- Filter by saved search, section, original currency, marketplace, title, seller or size. Tables use 50 rows per page; counts and charts cover all filtered latest rows.
- Price distributions and medians stay within one currency and lane, show priced/unknown counts, and use asking prices. Mixed sizes and conditions mean these charts are not automatic comparable-price benchmarks or delivered-cost rankings.
- Coverage and availability charts show observed counts. Seller charts show unknown evidence separately from numeric heuristic bands.
- Each cloud listing has paginated history with a price chart and inspectable saved evidence. History uses only the selected currency for the chart and leaves gaps for unknown prices.
- **Export filtered data** downloads all filtered latest records as JSON through repeated bounded reads. Reads share a database-generated timestamp cutoff, so concurrent new saves cannot reshuffle the export. Concurrent deletions can still remove rows. Downloads happen only when requested.
- **Delete saved search** displays the selected target and deletes its runs/observations after the in-app confirmation. Saves and deletion cannot overlap. The app does not delete the Supabase project or authentication user.

## Why PostgreSQL here

The data has relationships—targets, repeated observations, currencies, source identities and users—that SQL can query and aggregate directly. JSONB holds varied marketplace evidence without flattening it into misleading universal fields. Supabase supplies hosted browsing, HTTPS REST access compatible with Workers, and Auth/RLS. [REST API](https://supabase.com/docs/guides/api), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

MongoDB Atlas is also a viable managed database, but older tutorials relying on Atlas App Services Data API/HTTPS Endpoints are obsolete: those services reached end of life on September 30, 2025. A native-driver/backend integration would need separate validation. [MongoDB end-of-life notice](https://www.mongodb.com/docs/atlas/app-services/deprecation/)

At the September 14, 2026 research check, Supabase Free included a 500 MB database, with inactive-project pausing and no automatic backups; plan details can change. Review your project's quotas and [current pricing](https://supabase.com/pricing) before collecting a large history. No paid plan was purchased or selected by this change.

## Validation and remaining work

The tests run the actual migration in **PGlite PostgreSQL in RAM**, with separate authenticated users and anonymous-role checks. They cover ownership/FKs, direct-RPC validation, atomic failure, append-only grants, duplicate retries, latest-observation selection, lane/currency separation, deletion, exports beyond 1,000 rows, and a fixed read cutoff. They create no persistent test database files and do not require cloud credentials.

Run `npm run test:db` for those tests. The legacy D1 scaffold is unused and has no binding enabled; it is not the Library database. Do not run a local Supabase/Docker database unless you explicitly want one for a different workflow.

Hosted provisioning, connection configuration, migration and anonymous-access checks are complete for the maintainer's setup. Authenticated save/reload validation remains pending the application user's sign-in. Scheduled refreshes, alerts, backups/retention automation, richer seller entities, general image storage, and spend quotas for a publicly deployed service remain roadmap work. The new library protects its own data through Supabase Auth/RLS; it does not turn the existing search endpoints into a fully secured multi-user deployment.
