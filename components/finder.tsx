"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  Asterisk,
  Camera,
  Check,
  ChevronRight,
  Globe2,
  ImagePlus,
  Info,
  LoaderCircle,
  Package,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { marketplaces, searchQuery } from "@/lib/marketplaces";
import { referenceListings, matchesReference } from "@/lib/reference-listings";
import { resaleResearchFor, resaleCheckedAt } from "@/lib/resale-research";
import { emptySearchPresentation } from "@/lib/search-presentation";
import {
  GatReferenceImage,
  SourcingDirectory,
} from "@/components/sourcing-directory";
import { gatDemo } from "@/lib/sourcing-leads";
import {
  recordEvidence,
  freshness,
  applySellerCorrection,
  correctionFrom,
  withSellerCorrection,
  type SellerCorrection,
} from "@/lib/evidence";
import {
  parseIntent,
  intentFields,
  queryVariants,
  isGatQuery,
  type ItemIntent,
} from "@/lib/item-intent";
import { deduplicateListings } from "@/lib/listing-identity";
import { mergeSearchRun } from "@/lib/search-session";
import type { Continuation } from "@/lib/discovery/pagination";
import type { SearchRun } from "@/lib/discovery/types";
import { scoreSeller, scoreListing, landedCost } from "@/lib/scoring";
import {
  unknownEvidence,
  type Lane,
  type Listing,
  type SearchResponse,
} from "@/lib/finder-types";

const initialQuery = gatDemo.query;
const money = (n: number | null, currency = "USD") =>
  n === null
    ? "Price unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);
type Connections = {
  ebay: boolean;
  search: boolean;
  vision: boolean;
  poshmark: boolean;
};

export default function Finder() {
  const [query, setQuery] = useState(initialQuery),
    [searched, setSearched] = useState(initialQuery),
    [lane, setLane] = useState<Lane>("legit");
  const [listings, setListings] = useState<Listing[]>([]),
    [selected, setSelected] = useState<Listing | null>(null);
  const [manualListings, setManualListings] = useState<Listing[]>([]),
    [overrides, setOverrides] = useState<Record<string, SellerCorrection>>({});
  const [platform, setPlatform] = useState("all"),
    [sort, setSort] = useState("match"),
    [budget, setBudget] = useState("");
  const [size, setSize] = useState("all"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      "Search live sources or open a marketplace for additional results.",
    );
  const [image, setImage] = useState<string | null>(null),
    [imageName, setImageName] = useState("Your reference"),
    [visionBusy, setVisionBusy] = useState(false);
  const [connections, setConnections] = useState<Connections>({
      ebay: false,
      search: false,
      vision: false,
      poshmark: false,
    }),
    [settings, setSettings] = useState(false),
    [importOpen, setImportOpen] = useState(false);
  const [connectionsChecked, setConnectionsChecked] = useState(false);
  const [setupFailed, setSetupFailed] = useState(false);
  const [searchIssue, setSearchIssue] = useState<"failed" | "cancelled" | null>(
    null,
  );
  const [submittedFields, setSubmittedFields] = useState<
    Partial<ItemIntent["fields"]>
  >({});
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const [continuation, setContinuation] = useState<Continuation | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const submittedSearch = useRef<{
    query: string;
    lane: Lane;
    fields: Partial<ItemIntent["fields"]>;
    image?: string;
  } | null>(null);
  const visionRequest = useRef<AbortController | null>(null);
  const uploadId = useRef(0);
  const cancelIdentify = useCallback(() => {
    visionRequest.current?.abort();
    setVisionBusy(false);
  }, []);
  const [run, setRun] = useState<SearchRun | null>(null);
  const [targetFields, setTargetFields] = useState<
    Partial<ItemIntent["fields"]>
  >({});
  const target = parseIntent(query, targetFields);
  function loadGatDemo() {
    cancelSearch();
    cancelIdentify();
    uploadId.current++;
    setImage(null);
    setQuery(gatDemo.query);
    setSearched(gatDemo.query);
    setLane("reps");
    setTargetFields({});
    setSubmittedFields({});
    setSearchIssue(null);
    setListings([]);
    setContinuation(undefined);
    setRun(null);
    setPlatform("all");
    setSize("all");
    setBudget("");
    setMessage(
      "GAT supplier research is shown above. Search connected sources for additional indexed listings.",
    );
  }
  useEffect(() => {
    fetch("/api/status")
      .then((r) => {
        if (!r.ok) throw new Error("Status unavailable");
        return r.json();
      })
      .then((value) => setConnections(value as Connections))
      .then(() => setConnectionsChecked(true))
      .catch(() => setSetupFailed(true));
    return () => {
      request.current?.abort();
      visionRequest.current?.abort();
      uploadId.current++;
    };
  }, []);
  const runSearch = useCallback(
    async (
      q: string,
      category: Lane,
      fields: Partial<ItemIntent["fields"]> = {},
      photo?: string,
    ) => {
      if (!q.trim()) return;
      const id = ++requestId.current;
      cancelIdentify();
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setQuery(q);
      setSearched(q);
      setLane(category);
      setPlatform("all");
      setBusy(true);
      setListings([]);
      setContinuation(undefined);
      setLoadingMore(false);
      submittedSearch.current = {
        query: q,
        lane: category,
        fields,
        ...(photo ? { image: photo } : {}),
      };
      setRun(null);
      setTargetFields(fields);
      setSubmittedFields(fields);
      setSearchIssue(null);
      setMessage("Searching connected sources…");
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            lane: category,
            fields,
            ...(photo ? { image: photo } : {}),
          }),
          signal: controller.signal,
        });
        const data: SearchResponse & { error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error || "Search unavailable");
        if (id !== requestId.current) return;
        setListings(deduplicateListings(data.listings));
        setContinuation(data.continuation);
        setRun(data.run ?? null);
        setMessage(
          data.message +
            (data.errors.length ? ` ${data.errors.join(" ")}` : ""),
        );
      } catch (error) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setListings([]);
        setSearchIssue("failed");
        setMessage(
          error instanceof Error
            ? error.message
            : "Search failed. Use the marketplace links below.",
        );
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    },
    [cancelIdentify],
  );
  async function loadMore(all = false) {
    if (!continuation || !submittedSearch.current || busy) return;
    const submitted = submittedSearch.current;
    const id = ++requestId.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setLoadingMore(true);
    setSearchIssue(null);
    let cursor: Continuation | undefined = continuation;
    const seen = new Set<string>();
    try {
      do {
        const key = JSON.stringify(cursor);
        if (seen.has(key)) {
          setMessage(
            "The source repeated its cursor. Search paused; existing listings are retained.",
          );
          break;
        }
        seen.add(key);
        setMessage(
          all
            ? "Loading all available matching pages… You can stop and keep the results."
            : "Loading more listings…",
        );
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...submitted, continuation: cursor }),
          signal: controller.signal,
        });
        const data: SearchResponse & { error?: string } = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load this page.");
        if (id !== requestId.current || controller.signal.aborted) return;
        setListings((old) => deduplicateListings([...old, ...data.listings]));
        setRun((old) => mergeSearchRun(old, data.run));
        cursor = data.continuation;
        setContinuation(cursor);
        const blocked = data.run?.sources.some(
          (source) =>
            source.errorCode ||
            [
              "auth_error",
              "access_denied",
              "rate_limited",
              "timeout",
              "cancelled",
              "invalid_response",
              "unavailable",
              "circuit_open",
            ].includes(source.state),
        );
        setMessage(
          blocked
            ? "Some sources paused. Your retrieved listings are retained; check source status before retrying."
            : cursor
              ? "More matching pages are available."
              : "Loaded the matching pages returned by the connected sources. See coverage for each source.",
        );
        if (blocked) break;
      } while (all && cursor && !controller.signal.aborted);
    } catch (error) {
      if (id !== requestId.current || controller.signal.aborted) return;
      setMessage(
        `${error instanceof Error ? error.message : "Could not load more listings."} Your previous results are retained; you can retry.`,
      );
    } finally {
      if (id === requestId.current) {
        setBusy(false);
        setLoadingMore(false);
      }
    }
  }
  function cancelSearch() {
    request.current?.abort();
    requestId.current++;
    setBusy(false);
    setLoadingMore(false);
    setSearchIssue("cancelled");
    setMessage(
      "Search stopped. Retrieved listings are retained; you can continue loading or start a new search.",
    );
  }
  async function photoData() {
    if (!image) return undefined;
    if (!image.startsWith("/")) return image;
    const blob = await (await fetch(image)).blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  async function searchPhoto() {
    if (!connections.ebay) {
      setSettings(true);
      return;
    }
    const generation = requestId.current;
    const imageGeneration = uploadId.current;
    try {
      const photo = await photoData();
      if (
        generation !== requestId.current ||
        imageGeneration !== uploadId.current
      )
        return;
      await runSearch(query, "legit", targetFields, photo);
    } catch {
      setMessage("Could not read the reference photo. Try uploading it again.");
    }
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "search_clothing",
            title: "Search clothing",
            description:
              "Search connected clothing sources and update the visible Legit or Reps results. Does not buy or contact sellers.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", minLength: 2, maxLength: 180 },
                lane: { type: "string", enum: ["legit", "reps"] },
              },
              required: ["query", "lane"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            execute: async (input: unknown) => {
              const p = input as { query?: unknown; lane?: unknown };
              if (
                typeof p?.query !== "string" ||
                p.query.trim().length < 2 ||
                p.query.length > 180 ||
                (p.lane !== "legit" && p.lane !== "reps")
              )
                throw new Error("Provide a query and a valid lane");
              await runSearch(p.query, p.lane);
              return {
                query: p.query,
                lane: p.lane,
                status:
                  "Search finished; inspect visible results and source status",
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [runSearch]);
  async function upload(file: File | undefined) {
    if (!file) return;
    cancelIdentify();
    const id = ++uploadId.current;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("Choose a JPG, PNG, or WebP image under 5 MB.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    if (id !== uploadId.current) return;
    setImage(data);
    setImageName(file.name);
    setMessage(
      "Image added. Identify it to suggest search terms, or enter a title above.",
    );
  }
  async function identify() {
    if (!image) return;
    if (!connections.vision) {
      setSettings(true);
      return;
    }
    cancelIdentify();
    const controller = new AbortController();
    visionRequest.current = controller;
    setVisionBusy(true);
    try {
      let data = image;
      if (image.startsWith("/")) {
        const blob = await (await fetch(image)).blob();
        data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      }
      const response = await fetch("/api/identify", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: data }),
      });
      const result = (await response.json()) as {
        query: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error);
      if (controller.signal.aborted) return;
      setQuery(result.query);
      setTargetFields({});
      setMessage(
        "Suggested search terms added. Review the title, then find listings. Image identification is not authentication.",
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      setMessage(
        e instanceof Error ? e.message : "Image identification failed",
      );
    } finally {
      if (!controller.signal.aborted) setVisionBusy(false);
    }
  }
  const sources = marketplaces.filter((m) => m.lanes.includes(lane));
  const allListings = [
    ...manualListings.filter(
      (l) => l.searchQuery?.toLowerCase() === searched.toLowerCase(),
    ),
    ...listings,
  ].map((l) => withSellerCorrection(l, overrides[l.id]));
  const results = allListings
    .filter(
      (l) =>
        l.lane === lane &&
        (platform === "all" || l.platform === platform) &&
        (size === "all" || l.size === size) &&
        (!budget ||
          (l.currency === "USD" &&
            l.price !== null &&
            l.price <= Number(budget))),
    )
    .sort((a, b) =>
      sort === "trust"
        ? (scoreListing(b).score ?? -1) - (scoreListing(a).score ?? -1)
        : sort === "price"
          ? (a.currency === "USD" ? (a.price ?? Infinity) : Infinity) -
            (b.currency === "USD" ? (b.price ?? Infinity) : Infinity)
          : (b.matchAssessment?.rank ?? 0) - (a.matchAssessment?.rank ?? 0),
    );
  const lowest = results
    .filter(
      (l) =>
        ["live_api", "public_page"].includes(l.provenance ?? "") &&
        ["code_match", "model_match"].includes(l.matchAssessment?.kind ?? "") &&
        l.matchAssessment?.missing.length === 0 &&
        l.price !== null &&
        l.currency === "USD" &&
        l.availability !== "sold-out",
    )
    .sort((a, b) => a.price! - b.price!)[0];
  const showingReferences = allListings.some((l) => l.source === "research");
  const resaleExamples = resaleResearchFor(searched, lane, submittedFields).map(
    (l) => withSellerCorrection(l, overrides[l.id]),
  );
  const filteredResale = resaleExamples
    .filter(
      (l) =>
        (platform === "all" || l.platform === platform) &&
        (size === "all" || l.size === size) &&
        (!budget ||
          (l.currency === "USD" &&
            l.price !== null &&
            l.price <= Number(budget))),
    )
    .sort((a, b) =>
      sort === "trust"
        ? (scoreListing(b).score ?? -1) - (scoreListing(a).score ?? -1)
        : sort === "price"
          ? (a.currency === "USD" ? (a.price ?? Infinity) : Infinity) -
            (b.currency === "USD" ? (b.price ?? Infinity) : Infinity)
          : (b.matchAssessment?.rank ?? 0) - (a.matchAssessment?.rank ?? 0),
    );
  const emptyState = emptySearchPresentation({
    run,
    configured: connectionsChecked
      ? lane === "reps"
        ? connections.search
        : connections.search || connections.ebay || connections.poshmark
      : null,
    issue: searchIssue,
    setupFailed,
    hasFilteredListings:
      allListings.some((l) => l.lane === lane) && results.length === 0,
  });
  return (
    <div className="finder-shell">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Asterisk size={27} />
          </span>
          clothing finder<span className="beta">WORKSPACE</span>
        </a>
        <div className="top-actions">
          <span className="destination">
            <Globe2 size={15} /> Ship to US · USD
          </span>
          <button
            className="connection-button"
            onClick={() => setSettings(true)}
          >
            <span
              className={
                connections.ebay || connections.search || connections.poshmark
                  ? "status-dot connected"
                  : "status-dot"
              }
            />
            {connections.ebay || connections.search || connections.poshmark
              ? "Sources configured"
              : "Source setup"}
            <ChevronRight size={14} />
          </button>
        </div>
      </header>
      <main className="main-wrap">
        <div className="page-heading">
          <div>
            <div className="eyebrow">THE SEARCH IS PART OF THE FIND</div>
            <h1>Find your piece.</h1>
            <p>One search. More places to look.</p>
          </div>
          <div className="heading-index">01 / DISCOVER</div>
        </div>
        <form
          className="search-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query, lane, targetFields);
          }}
        >
          <Search size={21} />
          <input
            aria-label="Item title or description"
            maxLength={180}
            value={query}
            onChange={(e) => {
              cancelIdentify();
              setQuery(e.target.value);
              setTargetFields({});
            }}
            placeholder="A brand, a piece, a very specific obsession…"
          />
          <button
            type="button"
            aria-label="Add image"
            className="image-search-button"
            onClick={() => fileInput.current?.click()}
          >
            <Camera size={18} />
            <span>Add image</span>
          </button>
          <button
            aria-label="Find listings"
            className="primary-button"
            disabled={busy || !query.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Search size={17} />
            )}
            <span>{busy ? "Searching" : "Find listings"}</span>
          </button>
        </form>
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          ref={fileInput}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Tabs
          value={lane}
          onValueChange={(value) => {
            void runSearch(query, value as Lane, targetFields);
          }}
          className="lane-tabs"
        >
          <div className="tab-row">
            <TabsList variant="line">
              <TabsTrigger value="legit">
                <ShieldCheck size={17} />
                Legit<span className="tab-caption">Resale & retail</span>
              </TabsTrigger>
              <TabsTrigger value="reps">
                <LayersIcon />
                Reps
                <span className="tab-caption">Direct shops & factories</span>
              </TabsTrigger>
            </TabsList>
            <span className="tab-note">
              {lane === "legit"
                ? "Listed as authentic. Always verify the item."
                : "Similar designs, replica leads and supplier catalogs."}
            </span>
          </div>
        </Tabs>
        <div className="workspace-grid">
          <aside className="reference-column">
            <div className="section-kicker">
              YOUR REFERENCE <span>01</span>
            </div>
            <div
              className="reference-image"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void upload(e.dataTransfer.files?.[0]);
              }}
            >
              {image ? (
                <img src={image} alt="Uploaded clothing reference" />
              ) : isGatQuery(searched) ? (
                <GatReferenceImage />
              ) : (
                <ImagePlus size={44} />
              )}
              <button
                className="replace-image"
                aria-label="Replace reference image"
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={17} />
              </button>
              {image && image !== "/reference-jeans.png" && (
                <button
                  className="remove-image"
                  aria-label="Remove reference image"
                  onClick={() => {
                    cancelIdentify();
                    uploadId.current++;
                    setImage(null);
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="reference-caption">
              {!image && isGatQuery(searched)
                ? "Demo target · official product photo"
                : imageName}
            </div>
            {image === "/reference-jeans.png" ? (
              <>
                <h2>Rick Owens</h2>
                <p className="reference-description">
                  Bias bootcut · black / pearl degrade
                </p>
                <span className="small-label">
                  VISUAL MATCH TO RESEARCH · UNCONFIRMED
                </span>
              </>
            ) : !image && isGatQuery(searched) ? (
              <>
                <h2>Maison Margiela GATs</h2>
                <p className="reference-description">
                  White leather · suede panels · honey gum sole
                </p>
                <a
                  className="small-label"
                  href={gatDemo.source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OFFICIAL TARGET REFERENCE ↗
                </a>
                <p className="reference-description">
                  Upload your own photo to identify or search it.
                </p>
              </>
            ) : (
              <p className="reference-description">
                Add a title or identify this image to start your search.
              </p>
            )}
            <button
              className="outline-button identify-button"
              onClick={() => void identify()}
              disabled={!image || visionBusy}
            >
              <Sparkles size={15} />
              {visionBusy ? "Identifying…" : "Identify image"}
            </button>
            <div className="reference-rule" />
            <button
              className="outline-button identify-button"
              onClick={() => void searchPhoto()}
              disabled={!image || busy}
            >
              <Camera size={15} /> Search photo on eBay
            </button>
            <details className="target-profile">
              <summary>Refine target details</summary>
              <p className="microcopy">
                These details refine match ranking. Edit the search title to
                change source queries. Suggestions come from title words;
                matching does not verify authenticity.
              </p>
              {intentFields.map((field) => (
                <label key={field} className="field-label">
                  {field === "styleCode"
                    ? "Style code"
                    : field[0].toUpperCase() + field.slice(1)}
                  <input
                    value={target.fields[field] ?? ""}
                    maxLength={100}
                    placeholder="Unknown"
                    onChange={(e) =>
                      setTargetFields((old) => ({
                        ...old,
                        [field]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <div className="microcopy">
                {queryVariants(target).map((variant, index) => (
                  <p key={index}>
                    {variant.language.toUpperCase()}: {variant.text}
                  </p>
                ))}
              </div>
            </details>
            <div className="section-kicker">
              <SlidersHorizontal size={14} /> REFINE RESULTS
            </div>
            <label className="field-label">
              Item size
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="filter-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sizes</SelectItem>
                  {[
                    ...new Set(
                      [...allListings, ...resaleExamples]
                        .filter((l) => l.lane === lane)
                        .map((l) => l.size),
                    ),
                  ]
                    .filter((s) => s !== "Not specified")
                    .sort()
                    .map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <label className="field-label">
              Maximum item price (USD)
              <div className="budget-input">
                <span>$</span>
                <input
                  type="number"
                  min="0"
                  aria-label="Maximum item price in USD"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="No limit"
                />
              </div>
            </label>
            {budget && (
              <p className="microcopy">
                Unknown prices and other currencies are hidden.
              </p>
            )}
            <button
              className="text-button reset-button"
              onClick={() => {
                setBudget("");
                setSize("all");
                setPlatform("all");
              }}
            >
              Reset filters
            </button>
            <div className="trust-note">
              <ShieldCheck size={20} />
              <h3>Good price. Better evidence.</h3>
              <p>
                No sales, no listings, and a price that looks too low? That
                should lower trust, not raise your hopes.
              </p>
              <button className="text-button" onClick={() => setSettings(true)}>
                How scoring works <ArrowUpRight size={13} />
              </button>
            </div>
          </aside>
          <section className="results-column" aria-label="Search results">
            {lane === "reps" && (
              <SourcingDirectory
                key={searched}
                query={searched}
                onDemo={loadGatDemo}
              />
            )}
            <div className="results-heading">
              <div>
                <div className="section-kicker">
                  {lane === "legit"
                    ? showingReferences
                      ? "DATED REFERENCE COLLECTION"
                      : "LIVE MARKETPLACE SEARCH"
                    : "ADDITIONAL LIVE DISCOVERY"}
                </div>
                <h2>
                  {lane === "legit"
                    ? showingReferences
                      ? "Researched jeans examples."
                      : "Search resale listings."
                    : "Search the marketplaces."}
                </h2>
              </div>
              <button
                className="outline-button import-button"
                onClick={() => setImportOpen(true)}
              >
                + Add a listing
              </button>
            </div>
            <div className="source-filters">
              <button
                className={platform === "all" ? "chip active" : "chip"}
                onClick={() => setPlatform("all")}
              >
                All marketplaces
              </button>
              {sources.map((s) => (
                <button
                  className={platform === s.name ? "chip active" : "chip"}
                  key={s.id}
                  onClick={() => setPlatform(s.name)}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="result-meta">
              <span>
                <strong>{results.length}</strong>{" "}
                {lane === "reps"
                  ? "additional listings"
                  : showingReferences
                    ? "reference / session listings"
                    : results.length === 1
                      ? "retrieved listing"
                      : "retrieved listings"}
                {results.length !== allListings.length && (
                  <span> of {allListings.length} loaded · filters active</span>
                )}
                {lowest && (
                  <>
                    {" "}
                    <span className="meta-divider">/</span> Matching item prices
                    from <strong>{money(lowest.price)}</strong>
                  </>
                )}
              </span>
              <div className="sort-control">
                <ArrowDownUp size={13} />
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger aria-label="Sort listings">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="match">Closest match</SelectItem>
                    <SelectItem value="price">
                      Lowest item price · USD
                    </SelectItem>
                    <SelectItem value="trust">Seller trust</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="source-status" role="status">
              <Info size={14} />
              <span>{message}</span>
            </div>
            {busy && (
              <button className="outline-button" onClick={cancelSearch}>
                Cancel search
              </button>
            )}
            {run && (
              <div className="provider-status-grid" aria-label="Source results">
                {run.sources.map((source) => (
                  <div className="provider-status-card" key={source.id}>
                    <div>
                      <strong>{source.name}</strong>
                      <span className="pill neutral">
                        {source.state.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p>
                      {source.message}
                      {source.errorCode && source.state === "partial"
                        ? ` (${source.errorCode.replaceAll("_", " ")})`
                        : ""}
                    </p>
                    <small>
                      {source.count} candidates · {source.pages} pages ·{" "}
                      {source.requests} requests ·{" "}
                      {(source.elapsedMs / 1000).toFixed(1)}s
                    </small>
                    {source.skipped > 0 && (
                      <small>
                        {source.skipped} incomplete, unrelated or non-listing
                        results skipped
                      </small>
                    )}
                    {source.hasMore && (
                      <small>More matching pages are available.</small>
                    )}
                    {source.coverage === "provider_limit" && (
                      <small>
                        This source reached its search coverage boundary.
                      </small>
                    )}
                    {source.coverage === "unknown" && (
                      <small>Further coverage is unknown.</small>
                    )}
                    {source.queryTruncated && (
                      <small>eBay used the first 100 query characters.</small>
                    )}
                    {source.retryAfterMs !== undefined && (
                      <small>
                        Retry in about {Math.ceil(source.retryAfterMs / 1000)}{" "}
                        seconds.
                      </small>
                    )}
                    {source.fromCache && (
                      <small>Cached observation · {source.finishedAt}</small>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!busy && lane === "legit" && matchesReference(searched) && (
              <button
                className="reference-load"
                onClick={() => {
                  setQuery("Rick Owens bias bootcut jeans");
                  cancelIdentify();
                  setSearched("Rick Owens bias bootcut jeans");
                  setImage("/reference-jeans.png");
                  setTargetFields({});
                  setSubmittedFields({});
                  setSearchIssue(null);
                  setRun(null);
                  setContinuation(undefined);
                  setPlatform("all");
                  setSize("all");
                  setBudget("");
                  setListings(
                    referenceListings.map((listing) =>
                      recordEvidence(listing, "reference_snapshot"),
                    ),
                  );
                  setMessage(
                    "EXAMPLE COLLECTION · observed September 13, 2026 UTC. These are dated research snapshots. Recheck every price and availability.",
                  );
                }}
              >
                Load dated jeans examples · Sep 13, 2026 UTC
              </button>
            )}
            {continuation && (
              <div className="pagination-controls">
                <span>
                  {allListings.length} listings loaded · duplicates merged
                </span>
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => void loadMore(false)}
                >
                  Load more
                </button>
                <button
                  className="outline-button"
                  disabled={busy}
                  onClick={() => void loadMore(true)}
                >
                  Show all matching pages
                </button>
              </div>
            )}
            {busy && !loadingMore ? (
              <div className="empty-results">
                <LoaderCircle size={28} className="spin" />
                <h3>Looking for your piece…</h3>
                <p>Checking connected sources for “{searched}”.</p>
              </div>
            ) : results.length ? (
              <div className="listing-grid">
                {results.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onSelect={() => setSelected(listing)}
                    lowest={listing.id === lowest?.id}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-results">
                <Search size={28} />
                <h3>
                  {showingReferences
                    ? "No reference examples match these filters."
                    : emptyState.title}
                </h3>
                <p>
                  {showingReferences
                    ? "Clear your filters to see the dated reference collection."
                    : emptyState.body}
                </p>
              </div>
            )}
            {resaleExamples.length > 0 && (
              <details
                className="resale-research"
                aria-label="Researched GAT resale listings"
              >
                <summary>
                  Six dated research examples from other marketplaces
                </summary>
                <div className="results-heading">
                  <div>
                    <span className="section-kicker">
                      FOUND ON SECONDHAND MARKETPLACES
                    </span>
                    <h2>Pre-owned GATs to check out.</h2>
                  </div>
                </div>
                <p className="resale-research-note">
                  {filteredResale.length} of {resaleExamples.length} researched
                  listings · checked {resaleCheckedAt} UTC. These dated
                  public-page observations are separate from live search.
                  Recheck stock, size and price; colorways and condition vary.
                  Marketplace, size, budget and sorting controls apply here too.
                </p>
                {filteredResale.length ? (
                  <div className="listing-grid">
                    {filteredResale.map((listing) => (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        lowest={false}
                        onSelect={() => setSelected(listing)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="resale-research-note">
                    No researched examples match these filters. Clear the
                    filters to see the collection.
                  </p>
                )}
              </details>
            )}
            {lane === "reps" && <CostCalculator />}
            <div className="marketplace-heading">
              <h3>Keep looking</h3>
              <span>
                Search “{searched}” on the source <ArrowUpRight size={14} />
              </span>
            </div>
            <div className="marketplace-grid">
              {sources.map((s) => (
                <a
                  key={s.id}
                  href={s.search(searchQuery(searched, lane, s))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="marketplace-link"
                >
                  <span className={`marketplace-initial ${s.id}`}>
                    {s.name.slice(0, 1)}
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <span>{s.hint}</span>
                    <small>{s.route} · opens search</small>
                  </div>
                  <ArrowUpRight size={17} />
                </a>
              ))}
            </div>
            {lane === "reps" && (
              <div className="proxy-note">
                <Package size={19} />
                <p>
                  <strong>From seller to warehouse to you.</strong> Confirm the
                  buying agent accepts the item, ask for warehouse photos, and
                  add international shipping before comparing deals. Japanese
                  resale is in Legit; proxy use does not establish authenticity.
                </p>
                <a
                  href="https://bc.help.buyee.jp/en/fee/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Proxy fee guide <ArrowUpRight size={13} />
                </a>
              </div>
            )}
          </section>
        </div>
        <footer>
          <span>
            <Asterisk size={15} /> clothing finder
          </span>
          <span>Check the piece. Check the seller. Then decide.</span>
          <span>USD · US destination</span>
        </footer>
      </main>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="detail-sheet">
          {selected && (
            <ListingDetails
              listing={selected}
              onUpdate={(l) => {
                setOverrides((old) => ({ ...old, [l.id]: correctionFrom(l) }));
                setSelected(l);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={settings} onOpenChange={setSettings}>
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <span className="eyebrow">BEHIND THE FIND</span>
            <SheetTitle>Sources & seller trust</SheetTitle>
            <SheetDescription>
              See what is configured and how a score is made.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <h3>Source configuration</h3>
            {[
              [
                "Poshmark public search",
                connections.poshmark,
                "Paginated public listings · no API key needed",
              ],
              [
                "eBay Browse",
                connections.ebay,
                "Keyword and photo search with seller feedback",
              ],
              [
                "Brave Search",
                connections.search,
                "Find indexed listings across marketplaces",
              ],
              [
                "Image identification",
                connections.vision,
                "Suggest search terms from your photo",
              ],
            ].map(([name, ready, description]) => (
              <div className="connection-row" key={String(name)}>
                <div>
                  <strong>{name}</strong>
                  <p>{description}</p>
                </div>
                <span className={ready ? "pill good" : "pill neutral"}>
                  {ready ? "Configured" : "Not configured"}
                </span>
              </div>
            ))}
            <p className="detail-note">
              Configure optional keys in this project’s .env file, then restart.
              Poshmark public search and marketplace links work without keys.
              Private or login-only inventory requires opening the source.
            </p>
            <h3>Trust is earned through evidence</h3>
            <p>
              Scores consider sales history, active listings, feedback volume
              and quality, account age, and verified photo evidence. Missing
              data stays unknown.
            </p>
            <div className="trust-scale">
              <span>
                0–34
                <br />
                <b>High risk</b>
              </span>
              <span>
                35–59
                <br />
                <b>Caution</b>
              </span>
              <span>
                60–79
                <br />
                <b>Some evidence</b>
              </span>
              <span>
                80–98
                <br />
                <b>Strong history</b>
              </span>
            </div>
            <p>
              With no recorded sales, no active listings, and a price below 40%
              of at least three comparable items, trust is capped at 25. Without
              enough evidence, a numeric score is withheld.
            </p>
            <p className="detail-note">
              A heuristic score is not a probability or authenticity guarantee.
              Prices are compared only within the same item, condition, and
              authenticity category. These initial mixed-variant listings do not
              form a valid price benchmark.
            </p>
            <h3>Evidence you can check</h3>
            <p>
              Open any listing’s details to see its source, observation date,
              known metrics, and missing information. Manually added evidence is
              labelled as your input and is saved only for this session.
            </p>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className="detail-sheet">
          <ImportListing
            lane={lane}
            onAdd={(l) => {
              setManualListings((old) => [
                recordEvidence({ ...l, searchQuery: searched }, "manual_input"),
                ...old,
              ]);
              setImportOpen(false);
              setPlatform("all");
              setMessage(
                "Listing added for this session. Seller evidence is your input, not independently verified.",
              );
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
function LayersIcon() {
  return <Package size={17} />;
}
function ListingCard({
  listing: l,
  onSelect,
  lowest,
}: {
  listing: Listing;
  onSelect: () => void;
  lowest: boolean;
}) {
  const trust = scoreListing(l);
  const [failed, setFailed] = useState(false);
  return (
    <article className="listing-card">
      <button
        className="listing-image"
        onClick={onSelect}
        aria-label={`Details for ${l.title}`}
      >
        {l.image && !failed ? (
          <img
            loading="lazy"
            src={l.image}
            alt={l.title}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="no-photo">
            <Package size={38} />
            <span>Photo on source</span>
          </div>
        )}
        <span className="image-platform">{l.platform}</span>
        <span
          className={l.match === "close" ? "match-pill" : "match-pill related"}
        >
          {l.matchAssessment?.label ??
            (l.match === "close"
              ? "Close match"
              : l.source === "research"
                ? "Different finish"
                : "Match unverified")}
        </span>
        <span className="image-arrow">
          <ArrowUpRight size={18} />
        </span>
      </button>
      <div className="listing-copy">
        <div className="listing-brand">
          {freshness(l)}
          {lowest && <span>LOWEST MATCHING ITEM PRICE</span>}
        </div>
        <button onClick={onSelect} className="listing-title">
          {l.title}
        </button>
        <p className="listing-specs">
          {l.size} <span>·</span> {l.condition}
        </p>
        <div className="price-row">
          <strong>{money(l.price, l.currency)}</strong>
          <span>
            {l.shipping === null
              ? "Shipping unknown"
              : `+ ${money(l.shipping, l.currency)} shipping`}
            <small>Tax / fees extra</small>
          </span>
        </div>
        <button
          className={`trust-row ${trust.score !== null && trust.score >= 80 ? "strong-trust" : ""}`}
          onClick={onSelect}
        >
          <ShieldCheck size={17} />
          <span>
            {trust.score === null
              ? "Seller trust unknown"
              : `${trust.score}/100 · ${trust.label}`}
          </span>
          <ChevronRight size={15} />
        </button>
        <div className="card-actions">
          <button onClick={onSelect}>Evidence & details</button>
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            View listing <ArrowUpRight size={13} />
          </a>
        </div>
      </div>
    </article>
  );
}
function ListingDetails({
  listing: l,
  onUpdate,
}: {
  listing: Listing;
  onUpdate: (l: Listing) => void;
}) {
  const score = scoreListing(l);
  return (
    <>
      <SheetHeader>
        <span className="eyebrow">{l.platform} / EVIDENCE</span>
        <SheetTitle>{l.title}</SheetTitle>
        <SheetDescription>{l.authenticity}</SheetDescription>
      </SheetHeader>
      <div className="sheet-body">
        <div className="detail-price">
          {money(l.price, l.currency)}
          <span>
            {l.shipping === null
              ? "Shipping unknown"
              : `+ ${money(l.shipping, l.currency)} shipping · taxes / fees extra`}
          </span>
        </div>
        <a
          className="primary-button external-button"
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open original listing <ArrowUpRight size={16} />
        </a>
        <div className="score-panel">
          <ShieldCheck size={27} />
          <strong>
            {score.score === null ? "—" : score.score}
            <small>/ 100</small>
          </strong>
          <span>{score.label}</span>
          <p>
            {Math.round(score.coverage * 100)}% of evidence categories available
          </p>
        </div>
        <h3>{l.seller}</h3>
        <dl className="evidence-grid">
          <dt>Recorded sales</dt>
          <dd>{l.evidence.sold ?? "Unknown"}</dd>
          <dt>Active listings</dt>
          <dd>{l.evidence.active ?? "Unknown"}</dd>
          <dt>Seller review count</dt>
          <dd>{l.evidence.reviews ?? "Unknown"}</dd>
          <dt>Net feedback score</dt>
          <dd>{l.evidence.feedbackScore ?? "Unknown"}</dd>
          <dt>Positive feedback</dt>
          <dd>
            {l.evidence.positiveRate === null
              ? "Unknown"
              : new Intl.NumberFormat("en-US", {
                  style: "percent",
                  maximumFractionDigits: 2,
                }).format(l.evidence.positiveRate)}
          </dd>
          <dt>Account age</dt>
          <dd>
            {l.evidence.accountAgeDays === null
              ? "Unknown"
              : `${Math.floor(l.evidence.accountAgeDays / 365)}+ years`}
          </dd>
          <dt>Photo evidence</dt>
          <dd>{l.evidence.photos ?? "Not verified"}</dd>
        </dl>
        {score.reasons.length > 0 && (
          <ul className="reason-list">
            {score.reasons.map((r) => (
              <li key={r}>
                <Info size={14} />
                {r}
              </li>
            ))}
          </ul>
        )}
        <h3>Before you decide</h3>
        {l.matchAssessment && (
          <div className="detail-note">
            <strong>{l.matchAssessment.label}</strong>
            {l.matchAssessment.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {l.matchAssessment.missing.length > 0 && (
              <p>Not stated: {l.matchAssessment.missing.join(", ")}</p>
            )}
            <p>Title-based assessment · {l.matchAssessment.version}</p>
          </div>
        )}
        <p>{l.notes}</p>
        <p className="detail-note">
          {l.source === "research"
            ? "Research snapshot"
            : l.source === "manual"
              ? "User-entered evidence"
              : "API / search observation"}{" "}
          · {l.checkedAt}. Recheck the original page. “Available” reflects what
          was observed then. Seller trust does not authenticate this item.
        </p>
        <SellerCalculator key={l.id} listing={l} onUpdate={onUpdate} />
        <details className="observation-history">
          <summary>Observation history</summary>
          {(l.observations ?? []).map((observation, index) => (
            <div key={index}>
              <strong>
                {observation.field}: {observation.value ?? "Unknown"}
              </strong>
              <p>{observation.meaning}</p>
              <small>
                {observation.method.replaceAll("_", " ")} ·{" "}
                {observation.observedAt}
              </small>
              <small>
                Raw value: {observation.rawValue ?? "not provided"}
                {observation.expiresAt
                  ? ` · recheck after ${observation.expiresAt}`
                  : ""}
              </small>
              <a
                href={observation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Observation source <ArrowUpRight size={12} />
              </a>
            </div>
          ))}
        </details>
      </div>
    </>
  );
}
function SellerCalculator({
  listing,
  onUpdate,
}: {
  listing: Listing;
  onUpdate: (l: Listing) => void;
}) {
  const [sold, setSold] = useState(String(listing.evidence.sold ?? "")),
    [active, setActive] = useState(String(listing.evidence.active ?? "")),
    [median, setMedian] = useState(String(listing.comparison?.median ?? "")),
    [count, setCount] = useState(String(listing.comparison?.count ?? "")),
    [saved, setSaved] = useState(false);
  const number = (v: string) => (v.trim() === "" ? null : Number(v));
  const result = scoreSeller(
    { ...listing.evidence, sold: number(sold), active: number(active) },
    { price: listing.price, median: number(median), count: number(count) ?? 0 },
  );
  return (
    <details className="calculator-details">
      <summary>Check a seller with your own evidence</summary>
      <p>
        Use observed counts. Leave unavailable information blank. Comparable
        prices must match the item, condition, currency, and authenticity
        category.
      </p>
      <div className="form-grid">
        {[
          ["Recorded sales", sold, setSold],
          ["Active listings", active, setActive],
          ["Comparable median", median, setMedian],
          ["Comparable count", count, setCount],
        ].map(([label, value, setter]) => (
          <label key={String(label)} className="field-label">
            {String(label)}
            <input
              type="number"
              min="0"
              value={String(value)}
              placeholder="Unknown"
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="calculated-result">
        <strong>{result.score ?? "—"} / 100</strong>
        <span>{result.label} · based on your input</span>
      </div>
      {result.reasons.map((r) => (
        <p key={r} className="microcopy">
          {r}
        </p>
      ))}
      <button
        className="outline-button"
        onClick={() => {
          onUpdate(
            applySellerCorrection(listing, number(sold), number(active), {
              median: number(median),
              count: number(count) ?? 0,
            }),
          );
          setSaved(true);
        }}
      >
        {saved
          ? "Evidence saved for this session"
          : "Apply evidence to listing"}
      </button>
    </details>
  );
}
function CostCalculator() {
  const labels = [
    "Item price",
    "Domestic shipping",
    "International shipping",
    "Proxy / service fees",
    "Payment fees",
    "Tax / duty estimate",
  ];
  const [currency, setCurrency] = useState("CNY"),
    [rate, setRate] = useState(""),
    [values, setValues] = useState<string[]>(["", "", "", "", "", ""]);
  const result = landedCost(
    values.map((v) => (v === "" ? null : Number(v))),
    currency === "USD" ? 1 : Number(rate),
  );
  return (
    <section className="cost-calculator">
      <div>
        <span className="section-kicker">BEYOND THE PRICE TAG</span>
        <h3>What will it cost to your door?</h3>
        <p>
          Use the seller and proxy quotes. Enter every amount in the selected
          currency; use 0 only for a confirmed free cost.
        </p>
      </div>
      <div className="calculator-currency">
        <Select
          value={currency}
          onValueChange={(v) => {
            setCurrency(v);
            setRate("");
            setValues(["", "", "", "", "", ""]);
          }}
        >
          <SelectTrigger aria-label="Quote currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["CNY", "JPY", "USD", "EUR", "GBP"].map((c) => (
              <SelectItem value={c} key={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currency !== "USD" && (
          <label className="field-label">
            USD per 1 {currency}
            <input
              aria-label="USD exchange rate"
              type="number"
              step="any"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Your quoted rate"
            />
          </label>
        )}
      </div>
      <div className="cost-fields">
        {labels.map((label, i) => (
          <label key={label} className="field-label">
            {label} ({currency})
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Unknown"
              value={values[i]}
              onChange={(e) =>
                setValues((old) =>
                  old.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
            />
          </label>
        ))}
      </div>
      <div className="cost-total">
        <span>
          {result.total === null
            ? "Known subtotal · estimate incomplete"
            : "Estimated delivered total"}
        </span>
        <strong>
          {result.subtotal === null
            ? "Add an exchange rate"
            : money(result.total ?? result.subtotal)}
        </strong>
        <small>
          {result.missing
            ? `${result.missing} amounts still unknown`
            : "Based on your quotes; final carrier and customs costs may differ"}
        </small>
      </div>
    </section>
  );
}
function ImportListing({
  lane,
  onAdd,
}: {
  lane: Lane;
  onAdd: (l: Listing) => void;
}) {
  const [error, setError] = useState("");
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let url: URL;
    try {
      url = new URL(String(f.get("url")));
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
    } catch {
      setError("Enter a full HTTPS listing URL.");
      return;
    }
    const get = (key: string) => String(f.get(key) || "").trim();
    const number = (key: string) => (get(key) === "" ? null : Number(get(key)));
    const price = number("price"),
      sold = number("sold"),
      active = number("active");
    if (
      [price, sold, active].some(
        (n) => n !== null && (!Number.isFinite(n) || n < 0),
      )
    ) {
      setError("Amounts and counts must be zero or greater.");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      title: get("title"),
      platform: get("platform") || url.hostname.replace("www.", ""),
      url: url.href,
      price,
      currency: get("currency"),
      shipping: null,
      size: get("size") || "Not specified",
      condition: get("condition") || "Not specified",
      lane,
      seller: get("seller") || "Seller not specified",
      evidence: { ...unknownEvidence, sold, active },
      availability: "unknown",
      match: "related",
      source: "manual",
      checkedAt: new Date().toISOString().slice(0, 10),
      notes:
        get("notes") ||
        "User-added listing. Verify item details, seller history, shipping and availability on the source.",
      authenticity:
        lane === "reps"
          ? "User-added replica candidate · unverified"
          : "User-added as authentic · unverified",
    });
  }
  return (
    <>
      <SheetHeader>
        <span className="eyebrow">BRING YOUR OWN FIND</span>
        <SheetTitle>
          Add a listing to {lane === "legit" ? "Legit" : "Reps"}
        </SheetTitle>
        <SheetDescription>
          Copy evidence from the original page. Unknown is different from zero.
          Added listings last for this session.
        </SheetDescription>
      </SheetHeader>
      <form className="sheet-body import-form" onSubmit={add}>
        <label className="field-label">
          Listing URL
          <input
            type="url"
            name="url"
            placeholder="https://…"
            required
            maxLength={2000}
          />
        </label>
        <label className="field-label">
          Item title
          <input name="title" required maxLength={200} />
        </label>
        <div className="form-grid">
          <label className="field-label">
            Marketplace
            <input name="platform" placeholder="Taobao, Grailed…" />
          </label>
          <label className="field-label">
            Price
            <input
              name="price"
              type="number"
              min="0"
              step="any"
              placeholder="Unknown"
            />
          </label>
          <label className="field-label">
            Currency
            <input
              name="currency"
              defaultValue="USD"
              pattern="USD|CNY|JPY|EUR|GBP|CAD|AUD"
              title="USD, CNY, JPY, EUR, GBP, CAD or AUD"
              required
            />
          </label>
          <label className="field-label">
            Size
            <input name="size" placeholder="W30" />
          </label>
          <label className="field-label">
            Condition
            <input name="condition" placeholder="Used, new…" />
          </label>
          <label className="field-label">
            Seller
            <input name="seller" />
          </label>
          <label className="field-label">
            Recorded sales
            <input
              name="sold"
              type="number"
              min="0"
              step="1"
              placeholder="Unknown"
            />
          </label>
          <label className="field-label">
            Active listings
            <input
              name="active"
              type="number"
              min="0"
              step="1"
              placeholder="Unknown"
            />
          </label>
        </div>
        <label className="field-label">
          Notes / evidence
          <textarea
            name="notes"
            rows={4}
            placeholder="Condition, seller evidence, proxy requirement…"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button">
          <Check size={17} />
          Add to results
        </button>
      </form>
    </>
  );
}
