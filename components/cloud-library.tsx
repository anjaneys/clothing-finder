"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUpRight,
  Cloud,
  Database,
  Download,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import {
  makeCloudClient,
  savedSearches,
  saveSession,
  rpcFilters,
  exportRows,
  type CloudSettings,
} from "@/lib/library/client";
import {
  previewStats,
  type LibrarySession,
  type LibraryFilters,
  type LibraryRow,
  type LibraryStats,
  type SavedSearch,
} from "@/lib/library/model";
import { scoreListing } from "@/lib/scoring";
import { freshness } from "@/lib/evidence";
import type { Listing } from "@/lib/finder-types";
import "./cloud-library.css";

const price = (value: number | null, currency: string) =>
  value === null
    ? "Unknown"
    : currency === "XXX"
      ? String(value)
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(value);
const date = (value: string) => new Date(value).toLocaleString();
const emptyFilters: LibraryFilters = {
  searchId: null,
  lane: "legit",
  currency: "USD",
  platform: "",
  text: "",
};
function Bars({
  data,
  empty = "No observations yet.",
}: {
  data: { label: string; count: number }[];
  empty?: string;
}) {
  const max = Math.max(1, ...data.map((row) => row.count));
  return data.length ? (
    <div className="library-bars">
      {data.map((row) => (
        <div className="library-bar" key={row.label}>
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <b>{row.count}</b>
        </div>
      ))}
    </div>
  ) : (
    <p className="library-muted">{empty}</p>
  );
}

export default function CloudLibrary({
  visible,
  session,
  onBack,
}: {
  visible: boolean;
  session: LibrarySession;
  onBack: () => void;
}) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [settings, setSettings] = useState<CloudSettings | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [setupError, setSetupError] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false),
    [authMessage, setAuthMessage] = useState("");
  const [mode, setMode] = useState<"session" | "cloud">("session");
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters),
    [page, setPage] = useState(0);
  const [searches, setSearches] = useState<SavedSearch[]>([]),
    [options, setOptions] = useState<{
      currencies: string[];
      platforms: string[];
    }>({ currencies: [], platforms: [] });
  const [rows, setRows] = useState<LibraryRow[]>([]),
    [stats, setStats] = useState<LibraryStats | null>(null),
    [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0),
    [cutoff, setCutoff] = useState("");
  const [saveBusy, setSaveBusy] = useState(false),
    [saveMessage, setSaveMessage] = useState("");
  const [autoSave, setAutoSave] = useState(true);
  const [selected, setSelected] = useState<LibraryRow | null>(null),
    [historyRows, setHistoryRows] = useState<LibraryRow[]>([]),
    [historyTotal, setHistoryTotal] = useState(0),
    [historyPage, setHistoryPage] = useState(0),
    [historyError, setHistoryError] = useState("");
  const [deleting, setDeleting] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false),
    [exportMessage, setExportMessage] = useState("");
  const mounted = useRef(true),
    authGeneration = useRef(0),
    saveController = useRef<AbortController | null>(null),
    exportController = useRef<AbortController | null>(null);
  const lastAttempt = useRef("");
  const signature = useMemo(
    () => JSON.stringify([session.runId, session.listings]),
    [session.runId, session.listings],
  );
  const preview = useMemo(
    () => previewStats(session.listings, filters),
    [session.listings, filters],
  );
  const cloudMode = mode === "cloud" && !!client && !!user;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    fetch("/api/library/config", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not check cloud configuration.");
        const config: CloudSettings = await response.json();
        if (controller.signal.aborted) return;
        setSettings(config);
        const connection = await makeCloudClient(config);
        if (controller.signal.aborted) {
          connection?.auth.stopAutoRefresh();
          return;
        }
        setClient(connection);
        if (!connection) return;
        const listener = connection.auth.onAuthStateChange((_event, next) => {
          if (_event === "TOKEN_REFRESHED") return;
          authGeneration.current++;
          saveController.current?.abort();
          exportController.current?.abort();
          setUser(next?.user ?? null);
          setRows([]);
          setStats(null);
          setSearches([]);
          setSelected(null);
          setTotal(0);
          setOptions({ currencies: [], platforms: [] });
          setFilters(emptyFilters);
          setHistoryRows([]);
          setHistoryTotal(0);
          setHistoryError("");
          setExportMessage("");
          setLoadError("");
          setConfirmDelete(false);
          setDeleting(false);
          setSaveBusy(false);
          setExporting(false);
          setSaveMessage("");
          lastAttempt.current = "";
          setMode(next ? "cloud" : "session");
          setPage(0);
          setCutoff("");
        });
        cleanup = () => {
          listener.data.subscription.unsubscribe();
          connection.auth.stopAutoRefresh();
        };
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setSetupError(
            error instanceof Error
              ? error.message
              : "Cloud setup is unavailable.",
          );
      });
    return () => {
      mounted.current = false;
      controller.abort();
      cleanup?.();
      saveController.current?.abort();
      exportController.current?.abort();
    };
  }, []);

  useEffect(() => {
    setFilters((old) => ({ ...old, lane: session.lane }));
    setPage(0);
  }, [session.lane]);
  useEffect(() => {
    if (mode === "session") {
      setPage(0);
      setSelected(null);
    }
  }, [session.runId, mode]);
  useEffect(() => {
    if (!client || !user) return;
    const controller = new AbortController();
    Promise.all([
      savedSearches(client, controller.signal),
      client.rpc("cf_library_options").abortSignal(controller.signal),
    ])
      .then(([saved, choices]) => {
        if (controller.signal.aborted) return;
        if (choices.error)
          throw new Error(
            "Cloud tables are not ready. Apply the library migration to your project.",
          );
        setSearches(saved);
        setOptions(choices.data);
        setCutoff(choices.data.cutoff);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            String(error.message ?? "Could not load the cloud library."),
          );
      });
    return () => controller.abort();
  }, [client, user, revision]);

  useEffect(() => {
    if (!cloudMode || !client || !visible || !cutoff) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setRows([]);
    setStats(null);
    const args = rpcFilters(filters, cutoff);
    Promise.all([
      client
        .rpc("cf_library_page", { ...args, p_offset: page * 50, p_limit: 50 })
        .abortSignal(controller.signal),
      client.rpc("cf_library_stats", args).abortSignal(controller.signal),
    ])
      .then(([listingData, summary]) => {
        if (controller.signal.aborted) return;
        if (listingData.error || summary.error)
          throw new Error(
            "Could not read the cloud library. Check sign-in and the database migration.",
          );
        setRows(listingData.data.rows);
        setTotal(listingData.data.total);
        setStats(summary.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(error.message ?? "Cloud read failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, cloudMode, visible, filters, page, cutoff, revision]);

  useEffect(() => {
    if (!selected || !client || !user || !cutoff) return;
    const controller = new AbortController();
    setHistoryError("");
    setHistoryRows([]);
    client
      .from("cf_listing_observations")
      .select(
        "id,search_id,listing_key,observed_at,imported_at,price,currency,platform,availability,trust_score,snapshot",
        { count: "exact" },
      )
      .eq("search_id", selected.search_id)
      .eq("listing_key", selected.listing_key)
      .lte("imported_at", cutoff)
      .order("observed_at", { ascending: false })
      .order("imported_at", { ascending: false })
      .order("id")
      .range(historyPage * 50, historyPage * 50 + 49)
      .abortSignal(controller.signal)
      .then(({ data, error, count }) => {
        if (controller.signal.aborted) return;
        if (error) {
          setHistoryError("Could not read this item's history.");
          return;
        }
        setHistoryRows(data as LibraryRow[]);
        setHistoryTotal(count ?? 0);
      });
    return () => controller.abort();
  }, [selected, historyPage, client, user, cutoff]);

  async function save() {
    if (
      !client ||
      !user ||
      saveBusy ||
      deleting ||
      confirmDelete ||
      !session.listings.length ||
      session.busy
    )
      return;
    const controller = new AbortController(),
      generation = authGeneration.current;
    saveController.current = controller;
    setSaveBusy(true);
    lastAttempt.current = signature;
    const frozen = { ...session, listings: [...session.listings] };
    setSaveMessage(
      `Saving ${frozen.listings.length} session listings to the cloud…`,
    );
    try {
      const result = await saveSession(
        client,
        frozen,
        controller.signal,
        (n) => {
          if (!controller.signal.aborted)
            setSaveMessage(
              `Processed ${n} of ${frozen.listings.length} listings…`,
            );
        },
      );
      if (
        !mounted.current ||
        controller.signal.aborted ||
        generation !== authGeneration.current
      )
        return;
      setSaveMessage(
        `${result.saved} new observations saved${result.skipped ? ` · ${result.skipped} skipped by storage policy or validation` : " · existing copies were not duplicated"}.`,
      );
      setRevision((value) => value + 1);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        mounted.current &&
        generation === authGeneration.current
      )
        setSaveMessage(
          `${error instanceof Error ? error.message : "Save interrupted."} Completed batches remain saved; retrying is safe.`,
        );
    } finally {
      if (mounted.current && generation === authGeneration.current)
        setSaveBusy(false);
    }
  }
  useEffect(() => {
    if (
      autoSave &&
      client &&
      user &&
      session.runId &&
      !session.busy &&
      !saveBusy &&
      !deleting &&
      !confirmDelete &&
      session.listings.length &&
      lastAttempt.current !== signature
    )
      void save();
    // The signature represents the immutable payload; save captures that payload before awaiting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoSave,
    client,
    user,
    session.busy,
    session.runId,
    signature,
    saveBusy,
    deleting,
    confirmDelete,
  ]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await client.auth.signInWithPassword({ email, password });
    setPassword("");
    setAuthBusy(false);
    if (error)
      setAuthMessage(
        "Sign-in failed. Use an application user from your Supabase project's Authentication section.",
      );
  }
  function updateFilters(next: Partial<LibraryFilters>) {
    setFilters((old) => ({ ...old, ...next }));
    setPage(0);
    setSelected(null);
    setConfirmDelete(false);
  }
  async function deleteSearch() {
    if (!client || !filters.searchId || deleting || saveBusy) return;
    const deletingId = filters.searchId,
      generation = authGeneration.current;
    setDeleting(true);
    setLoadError("");
    const { error } = await client
      .from("cf_saved_searches")
      .delete()
      .eq("id", deletingId);
    if (generation !== authGeneration.current || !mounted.current) return;
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      setLoadError("Could not delete the saved search. Try again.");
      return;
    }
    updateFilters({ searchId: null });
    setRevision((value) => value + 1);
  }
  async function exportData() {
    if (!client || !cloudMode) return;
    const controller = new AbortController(),
      generation = authGeneration.current;
    exportController.current = controller;
    setExporting(true);
    setExportMessage("Preparing all filtered cloud records…");
    try {
      const records = await exportRows(
        client,
        filters,
        cutoff,
        controller.signal,
        (n) => setExportMessage(`Prepared ${n} records…`),
      );
      if (controller.signal.aborted || generation !== authGeneration.current)
        return;
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                cutoff,
                filters,
                records,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "clothing-finder-library.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage(`Downloaded ${records.length} filtered latest records.`);
    } catch (error) {
      if (!controller.signal.aborted)
        setExportMessage(
          error instanceof Error ? error.message : "Export failed.",
        );
    } finally {
      if (mounted.current && generation === authGeneration.current)
        setExporting(false);
    }
  }

  const activeStats = cloudMode ? stats : preview.stats;
  const displayed = cloudMode
    ? rows.map((row) => ({ listing: row.snapshot.listing, row }))
    : preview.rows
        .slice(page * 50, page * 50 + 50)
        .map((listing) => ({ listing, row: null }));
  const count = cloudMode ? total : preview.rows.length;
  const currencies = [
    ...new Set([
      "USD",
      "EUR",
      "GBP",
      "CNY",
      "JPY",
      "XXX",
      ...options.currencies,
      ...session.listings.map((l) => l.currency),
    ]),
  ];
  const platforms = [
    ...new Set([
      ...options.platforms,
      ...session.listings.map((l) => l.platform),
    ]),
  ].sort();
  const activeSearch = cloudMode
    ? searches.find((search) => search.id === filters.searchId)
    : undefined;

  return (
    <main className="library-shell" hidden={!visible}>
      <div className="library-heading">
        <div>
          <div className="eyebrow">YOUR RESEARCH, OVER TIME</div>
          <h1>Your library.</h1>
          <p>
            Browse saved pieces. See prices, coverage, and the evidence behind
            them.
          </p>
        </div>
        <button className="outline-button" onClick={onBack}>
          <ArrowLeft size={15} /> Back to finder
        </button>
      </div>
      <section
        className="cloud-connection"
        aria-label="Cloud database connection"
      >
        <div className="cloud-connection-title">
          <Database size={22} />
          <div>
            <h2>
              {user
                ? "Private cloud library"
                : settings?.configured
                  ? "Connect to your private library"
                  : "Cloud storage is ready to connect"}
            </h2>
            <p>
              {user
                ? `Signed in as ${user.email}. Listing records are stored in your hosted Supabase database.`
                : "Supabase stores the database in the cloud. Session preview below has not been saved."}
            </p>
          </div>
          <span className={`pill ${user ? "good" : "neutral"}`}>
            {user
              ? "Signed in"
              : settings?.configured
                ? "Sign-in required"
                : "Not connected"}
          </span>
        </div>
        {setupError && <p role="alert">{setupError}</p>}
        {!settings && !setupError && (
          <p className="library-muted">Checking cloud setup…</p>
        )}
        {settings && !settings.configured && (
          <div className="cloud-setup">
            <p>
              Create a Supabase project, apply the library schema, and add its
              project URL and publishable key to this app. Your database stays
              private even though the code is public.
            </p>
            <a
              className="outline-button"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Open Supabase <ArrowUpRight size={14} />
            </a>
            <a
              className="text-button"
              href="https://github.com/anjaneys/clothing-finder/blob/main/docs/DATABASE.md"
              target="_blank"
              rel="noreferrer"
            >
              Connection guide
            </a>
          </div>
        )}
        {client && !user && (
          <form className="library-signin" onSubmit={signIn}>
            <label className="field-label">
              Library email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field-label">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary-button" disabled={authBusy}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
            <p className="library-muted">
              Use an app user created in Supabase Authentication. Sign-in lasts
              for this open tab; saved records survive reloads.
            </p>
            {authMessage && <p role="alert">{authMessage}</p>}
          </form>
        )}
        {client && user && (
          <div className="cloud-actions">
            <label>
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />{" "}
              Save completed searches automatically
            </label>
            <button
              className="outline-button"
              onClick={() => void save()}
              disabled={
                saveBusy ||
                deleting ||
                confirmDelete ||
                session.busy ||
                !session.listings.length ||
                !session.runId
              }
            >
              <Save size={14} />
              {saveBusy
                ? "Saving…"
                : `Save session (${session.listings.length})`}
            </button>
            <button
              className="text-button"
              onClick={() => void client.auth.signOut({ scope: "local" })}
            >
              Sign out
            </button>
          </div>
        )}
        {saveMessage && (
          <p className="library-message" role="status">
            {saveMessage}
          </p>
        )}
      </section>
      <div className="library-toolbar">
        <div className="library-mode" role="group" aria-label="Data location">
          <button
            className={mode === "session" ? "active" : ""}
            onClick={() => {
              setMode("session");
              setSelected(null);
              setConfirmDelete(false);
              setPage(0);
            }}
          >
            Session preview <span>{session.listings.length}</span>
          </button>
          <button
            className={cloudMode ? "active" : ""}
            disabled={!user}
            onClick={() => {
              setMode("cloud");
              setSelected(null);
              setConfirmDelete(false);
              setPage(0);
            }}
          >
            Saved in cloud <Cloud size={14} />
          </button>
        </div>
        <div className="library-tool-actions">
          {cloudMode && (
            <>
              <button
                className="outline-button"
                onClick={() => {
                  setRevision((value) => value + 1);
                }}
                disabled={loading}
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                className="outline-button"
                onClick={() => void exportData()}
                disabled={exporting || !total}
              >
                <Download size={14} />
                {exporting ? "Exporting…" : "Export filtered data"}
              </button>
              {exporting && (
                <button
                  className="text-button"
                  onClick={() => {
                    exportController.current?.abort();
                    setExporting(false);
                    setExportMessage("Export cancelled.");
                  }}
                >
                  Cancel export
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="library-muted">
        {cloudMode
          ? "Charts use the latest saved observation for each listing within a search. They include every matching saved row, not just the current table page."
          : `Unsaved preview of “${session.query}”. This data is in tab memory until you connect and save it.`}
      </p>
      {exportMessage && (
        <p className="library-message" role="status">
          {exportMessage}
        </p>
      )}
      <div className="library-filters">
        {cloudMode && (
          <label>
            Saved search
            <select
              aria-label="Saved search"
              value={filters.searchId ?? ""}
              onChange={(e) => {
                const search = searches.find((s) => s.id === e.target.value);
                updateFilters({
                  searchId: e.target.value || null,
                  ...(search ? { lane: search.lane } : {}),
                });
              }}
            >
              <option value="">All saved searches</option>
              {searches.map((search) => (
                <option key={search.id} value={search.id}>
                  {search.query} · {search.lane}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Section
          <select
            aria-label="Library section"
            value={filters.lane}
            onChange={(e) =>
              updateFilters({ lane: e.target.value as "legit" | "reps" })
            }
          >
            <option value="legit">Legit</option>
            <option value="reps">Reps</option>
          </select>
        </label>
        <label>
          Currency
          <select
            aria-label="Library currency"
            value={filters.currency}
            onChange={(e) => updateFilters({ currency: e.target.value })}
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency === "XXX" ? "Unknown currency" : currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Marketplace
          <select
            aria-label="Library marketplace"
            value={filters.platform}
            onChange={(e) => updateFilters({ platform: e.target.value })}
          >
            <option value="">All marketplaces</option>
            {platforms.map((platform) => (
              <option key={platform}>{platform}</option>
            ))}
          </select>
        </label>
        <label className="library-text-filter">
          Find in data
          <input
            aria-label="Search library data"
            value={filters.text}
            maxLength={180}
            onChange={(e) => updateFilters({ text: e.target.value })}
            placeholder="Title, seller, or size"
          />
        </label>
      </div>
      <button
        className="text-button"
        onClick={() => updateFilters({ ...emptyFilters, lane: session.lane })}
      >
        Reset view filters
      </button>
      {loadError && cloudMode && (
        <p className="library-error" role="alert">
          {loadError}
        </p>
      )}
      {loading && cloudMode && (
        <p className="library-message">
          <LoaderCircle size={16} className="spin" /> Reading cloud records…
        </p>
      )}
      {activeStats && (
        <>
          <div className="library-metrics">
            <div>
              <span>Listing entries</span>
              <strong>{activeStats.total.toLocaleString()}</strong>
              <small>
                {cloudMode && !filters.searchId
                  ? "Same offer can belong to multiple saved searches"
                  : "Latest observations in this view"}
              </small>
            </div>
            <div>
              <span>Median asking price</span>
              <strong>{price(activeStats.median, filters.currency)}</strong>
              <small>
                {activeStats.priced} priced · {activeStats.missingPrice} unknown
              </small>
            </div>
            <div>
              <span>Observed price range</span>
              <strong className="library-range">
                {price(activeStats.min, filters.currency)} –{" "}
                {price(activeStats.max, filters.currency)}
              </strong>
              <small>Item price only; shipping may be missing</small>
            </div>
            <div>
              <span>Seller trust unknown</span>
              <strong>{activeStats.unknownTrust.toLocaleString()}</strong>
              <small>Missing history is not a zero score</small>
            </div>
          </div>
          <div className="library-charts">
            <section>
              <h2>Asking-price distribution</h2>
              <p>
                {filters.currency} · {filters.lane} · {activeStats.priced}{" "}
                observed prices
              </p>
              <Bars data={activeStats.prices} />
              <small>
                Mixed sizes and condition can affect prices. This chart is not a
                comparable-price benchmark.
              </small>
            </section>
            <section>
              <h2>Marketplace coverage</h2>
              <p>Saved listing entries by source</p>
              <Bars data={activeStats.marketplaces} />
            </section>
            <section>
              <h2>Seller evidence</h2>
              <p>Heuristic trust bands, with unknowns shown separately</p>
              <Bars data={activeStats.trust} />
            </section>
            <section>
              <h2>Observed availability</h2>
              <p>Last observed status; recheck before buying</p>
              <Bars data={activeStats.availability} />
            </section>
          </div>
        </>
      )}
      <section className="library-data">
        <div className="library-data-heading">
          <div>
            <h2>
              {activeSearch
                ? activeSearch.query
                : cloudMode
                  ? "Saved listing data"
                  : "Session listing data"}
            </h2>
            <p>
              {count} matching entries · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(count / 50))}
            </p>
          </div>
          {cloudMode && filters.searchId && (
            <button
              className="text-button"
              disabled={saveBusy || deleting}
              onClick={() => setConfirmDelete(!confirmDelete)}
            >
              Delete saved search
            </button>
          )}
        </div>
        {confirmDelete && (
          <div className="library-error">
            <p>
              Delete “{activeSearch?.query}” and its saved observations from
              your cloud library?
            </p>
            <button
              className="outline-button"
              onClick={() => void deleteSearch()}
              disabled={deleting || saveBusy}
            >
              {deleting ? "Deleting…" : "Delete search and observations"}
            </button>
            <button
              className="text-button"
              onClick={() => setConfirmDelete(false)}
            >
              Keep search
            </button>
          </div>
        )}
        <div className="library-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Source / seller</th>
                <th>Asking price</th>
                <th>Size / status</th>
                <th>Seller evidence</th>
                <th>Observed</th>
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(({ listing, row }, index) => (
                <tr key={row?.id ?? `${listing.id}-${index}`}>
                  <td>
                    <a href={listing.url} target="_blank" rel="noreferrer">
                      {listing.title} <ArrowUpRight size={12} />
                    </a>
                    <small>{listing.authenticity}</small>
                  </td>
                  <td>
                    {listing.platform}
                    <small>{listing.seller}</small>
                  </td>
                  <td>
                    {price(listing.price, listing.currency)}
                    <small>
                      {listing.shipping === null
                        ? "Shipping unknown"
                        : `Shipping ${price(listing.shipping, listing.currency)}`}
                    </small>
                  </td>
                  <td>
                    {listing.size}
                    <small>{listing.availability}</small>
                  </td>
                  <td>
                    {scoreListing(listing).score ?? "Unknown"}
                    <small>{scoreListing(listing).label}</small>
                  </td>
                  <td>
                    {date(listing.observedAt ?? listing.checkedAt)}
                    <small>{freshness(listing)}</small>
                  </td>
                  <td>
                    {row ? (
                      <button
                        className="outline-button"
                        aria-label={`History for ${listing.title}`}
                        onClick={() => {
                          setSelected(row);
                          setHistoryPage(0);
                        }}
                      >
                        <History size={14} />
                      </button>
                    ) : (
                      <span className="library-muted">Save first</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!displayed.length && !loading && (
          <div className="library-empty">
            <Database size={26} />
            <h3>
              {cloudMode
                ? "No saved rows match this view."
                : "No session listings match this view."}
            </h3>
            <p>
              {cloudMode
                ? "Save a search or adjust the currency, section, and filters."
                : "Run a search in the finder, then return here to explore the data."}
            </p>
          </div>
        )}
        <div className="library-pagination">
          <button
            className="outline-button"
            disabled={!page || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous 50
          </button>
          <span>
            {count ? page * 50 + 1 : 0}–{Math.min((page + 1) * 50, count)} of{" "}
            {count}
          </span>
          <button
            className="outline-button"
            disabled={(page + 1) * 50 >= count || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next 50
          </button>
        </div>
      </section>
      {selected && (
        <section
          className="library-history"
          aria-label="Listing observation history"
        >
          <div className="library-data-heading">
            <div>
              <h2>{selected.snapshot.listing.title}</h2>
              <p>
                Price and availability observations · {historyTotal} saved
                snapshots
              </p>
            </div>
            <button
              className="outline-button"
              aria-label="Close history"
              onClick={() => setSelected(null)}
            >
              <X size={16} />
            </button>
          </div>
          {historyError && <p role="alert">{historyError}</p>}
          <HistoryPlot rows={historyRows} currency={selected.currency} />
          <p className="library-muted">
            Chart shows this history page in {selected.currency}; gaps represent
            unknown prices. These are asking prices, not completed sales.
          </p>
          <div className="library-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Price</th>
                  <th>Availability</th>
                  <th>Evidence source</th>
                  <th>Saved record</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.id}>
                    <td>{date(row.observed_at)}</td>
                    <td>{price(row.price, row.currency)}</td>
                    <td>{row.availability}</td>
                    <td>{row.snapshot.listing.provenance}</td>
                    <td>
                      <details>
                        <summary>Inspect evidence</summary>
                        <pre>{JSON.stringify(row.snapshot, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="library-pagination">
            <button
              className="outline-button"
              disabled={!historyPage}
              onClick={() => setHistoryPage((p) => p - 1)}
            >
              Earlier page
            </button>
            <span>
              Page {historyPage + 1} of{" "}
              {Math.max(1, Math.ceil(historyTotal / 50))}
            </span>
            <button
              className="outline-button"
              disabled={(historyPage + 1) * 50 >= historyTotal}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              Older observations
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function HistoryPlot({
  rows,
  currency,
}: {
  rows: LibraryRow[];
  currency: string;
}) {
  const ordered = [...rows].reverse();
  const values = ordered.flatMap((row) =>
    row.currency === currency && row.price !== null ? [row.price] : [],
  );
  if (!values.length)
    return (
      <p className="library-muted">
        No comparable-currency prices on this history page.
      </p>
    );
  const lo = Math.min(...values),
    hi = Math.max(...values),
    span = hi - lo || 1;
  return (
    <svg
      className="library-history-plot"
      viewBox="0 0 800 180"
      role="img"
      aria-label={`Observed asking-price history in ${currency}`}
    >
      <line x1="45" x2="775" y1="150" y2="150" stroke="#d3dacb" />
      <text x="5" y="22">
        {Math.round(hi)}
      </text>
      <text x="5" y="148">
        {Math.round(lo)}
      </text>
      {ordered.map((row, i) => {
        if (row.currency !== currency || row.price === null) return null;
        const x = 55 + (i / Math.max(1, ordered.length - 1)) * 710,
          y = 140 - ((row.price - lo) / span) * 115;
        const next = ordered[i + 1];
        return (
          <g key={row.id}>
            {next && next.currency === currency && next.price !== null && (
              <line
                x1={x}
                y1={y}
                x2={55 + ((i + 1) / Math.max(1, ordered.length - 1)) * 710}
                y2={140 - ((next.price - lo) / span) * 115}
                stroke="#718c4f"
                strokeWidth="2"
              />
            )}
            <circle cx={x} cy={y} r="4" fill="#526d35">
              <title>
                {date(row.observed_at)} · {price(row.price, currency)}
              </title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
