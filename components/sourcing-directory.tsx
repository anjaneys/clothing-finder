"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  Package,
  ShieldCheck,
} from "lucide-react";
import {
  filterLeads,
  gatDemo,
  leadsForQuery,
  minimumGoodsCost,
  sourcingCheckedAt,
  type SourcingFilter,
  type SourcingLead,
} from "@/lib/sourcing-leads";

const price = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value);
const accessLabel = {
  page_checked: "Product page checked",
  index_only: "Partial page access",
  community_only: "Unverified community lead",
};
const kindLabel = {
  independent: "Independent design",
  replica_lead: "Replica lead · unverified",
  factory: "Bulk manufacturer lead",
};

export function GatReferenceImage() {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Package
      size={42}
      aria-label="Open the official product reference for photos"
    />
  ) : (
    <img
      src={gatDemo.image}
      alt="Maison Margiela white leather and suede Replica sneakers with a gum sole — official target reference"
      onError={() => setFailed(true)}
    />
  );
}

export function SourcingDirectory({
  query,
  onDemo,
}: {
  query: string;
  onDemo: () => void;
}) {
  const [filter, setFilter] = useState<SourcingFilter>("single");
  const [country, setCountry] = useState("all");
  const leads = leadsForQuery(query);
  const visible = filterLeads(leads, filter, country);
  if (!leads.length)
    return (
      <section
        className="sourcing-intro"
        aria-label="Direct supplier directory"
      >
        <span className="section-kicker">DIRECT SUPPLIERS</span>
        <h2>Find who makes a similar piece.</h2>
        <p>
          No researched supplier set for this title yet. Marketplace discovery
          below uses your query.
        </p>
        <button className="outline-button" onClick={onDemo}>
          Try the Margiela GAT demo <ArrowUpRight size={15} />
        </button>
      </section>
    );
  return (
    <section
      className="sourcing-directory"
      aria-label="Direct supplier directory"
    >
      <div className="sourcing-intro">
        <div className="sourcing-heading">
          <span className="section-kicker">DIRECT TO THE SOURCE</span>
          <span className="sourcing-count">
            {leads.length.toString().padStart(2, "0")} RESEARCHED LINKS
          </span>
        </div>
        <h2>The GAT look. More ways to find it.</h2>
        <p>
          Start with single-pair shops, inspect a replica lead, or explore
          factories that make similar trainers.
        </p>
        <div className="sourcing-target">
          <span>LEATHER + SUEDE</span>
          <span>LOW PROFILE</span>
          <span>GUM SOLE</span>
        </div>
        <p className="sourcing-disclosure">
          Demo: classic white Margiela GATs. “Replica” is also Margiela’s model
          name. Independent designs below are other brands; factory claims do
          not establish any connection to Margiela.
        </p>
        <a
          className="sourcing-reference-link"
          href={gatDemo.source}
          target="_blank"
          rel="noopener noreferrer"
        >
          View the official target · {gatDemo.code} <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="sourcing-controls">
        <div
          className="sourcing-tabs"
          role="group"
          aria-label="Supplier purchase type"
        >
          {(
            [
              ["single", "Buy one pair"],
              ["replica_lead", "Replica leads"],
              ["factory", "Factories / bulk"],
              ["all", "All links"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>{filterLeads(leads, id, "all").length}</span>
            </button>
          ))}
        </div>
        <label className="sourcing-country">
          Seller location
          <select
            aria-label="Supplier location"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="all">All locations</option>
            <option value="China">China</option>
            <option value="Japan">Japan storefront</option>
          </select>
        </label>
      </div>
      <p className="sourcing-date">
        Research checked {sourcingCheckedAt} UTC · {visible.length} links in
        this view · recheck prices, sizes and stock. Supplier filters apply to
        this directory.
      </p>
      {filter === "factory" && (
        <div className="sourcing-bulk-note">
          <Building2 size={19} />
          <p>
            Factory prices are per pair at the stated minimum order. Sample
            prices and freight need separate quotes; these are not single-pair
            deals.
          </p>
        </div>
      )}
      {visible.length ? (
        <div className="supplier-grid">
          {visible.map((lead) => (
            <SupplierCard key={lead.id} lead={lead} />
          ))}
        </div>
      ) : (
        <p className="sourcing-no-results">
          No researched links match these filters. Choose another purchase type
          or location.
        </p>
      )}
      <div className="sourcing-next">
        <ShieldCheck size={18} />
        <p>
          Seller history stays unknown until it can be verified. Published
          policies and company details help you investigate; product reviews,
          forum praise and factory claims do not become verified sales counts.
        </p>
      </div>
    </section>
  );
}

function SupplierCard({ lead }: { lead: SourcingLead }) {
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const minimum = minimumGoodsCost(lead);
  return (
    <article className="supplier-card">
      <a
        className={`supplier-visual ${lead.image && !failed ? "" : "supplier-no-image"}`}
        href={lead.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${lead.company}: ${lead.title}`}
      >
        {lead.image && !failed ? (
          <img
            src={lead.image}
            loading="lazy"
            alt={lead.title}
            onError={() => setFailed(true)}
          />
        ) : (
          <>
            <Building2 size={38} />
            <span>
              {lead.kind === "replica_lead"
                ? "Inspect the original listing"
                : "Explore the supplier catalog"}
            </span>
          </>
        )}
        <span className="supplier-location">{lead.country}</span>
        <ArrowUpRight className="supplier-image-arrow" size={21} />
      </a>
      <div className="supplier-body">
        <div className={`supplier-kind ${lead.kind}`}>
          {kindLabel[lead.kind]}
        </div>
        <h3>{lead.company}</h3>
        <p className="supplier-product">{lead.title}</p>
        <div className="supplier-price">
          <strong>
            {lead.unitPrice === null
              ? lead.kind === "factory"
                ? "Request a quote"
                : "Price unverified"
              : price(lead.unitPrice, lead.currency)}
          </strong>
          {lead.unitPrice !== null && (
            <span>
              {lead.purchase === "bulk" ? "/ pair at MOQ" : "item price"}
            </span>
          )}
        </div>
        <p className="supplier-price-note">{lead.priceNote}</p>
        <div className="supplier-order">
          <Package size={16} />
          <span>{lead.minimumOrderNote}</span>
        </div>
        {lead.purchase === "bulk" && minimum !== null && (
          <p className="supplier-minimum">
            Minimum goods estimate:{" "}
            <strong>{price(minimum, lead.currency)}</strong>
            <span>before samples, freight and import charges</span>
          </p>
        )}
        <p className="supplier-differences">{lead.differences}</p>
        <dl className="supplier-facts">
          <dt>Sizes</dt>
          <dd>{lead.sizes}</dd>
          <dt>Getting it to you</dt>
          <dd>{lead.shipping}</dd>
        </dl>
        <div className="supplier-trust">
          <ShieldCheck size={17} />
          <div>
            <strong>Seller history: unknown</strong>
            <span>{accessLabel[lead.access]}</span>
          </div>
        </div>
        <details className="supplier-evidence">
          <summary>Inspect company evidence & gaps</summary>
          {lead.evidence.map((e, i) => (
            <div key={i}>
              <small>{e.basis}</small>
              <p>{e.text}</p>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                Check evidence <ArrowUpRight size={12} />
              </a>
            </div>
          ))}
          <strong className="supplier-gaps-label">Still unverified</strong>
          <ul>
            {lead.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </details>
        <div className="supplier-actions">
          <a href={lead.url} target="_blank" rel="noopener noreferrer">
            {lead.kind === "factory"
              ? "View supplier product"
              : "View product link"}
            <ArrowUpRight size={16} />
          </a>
          <button
            aria-label={`Copy ${lead.company} product link`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lead.url);
                setCopied(true);
                setCopyError(false);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div className="supplier-secondary-links">
          <a href={lead.companyUrl} target="_blank" rel="noopener noreferrer">
            Company / seller
          </a>
          <a href={lead.shippingUrl} target="_blank" rel="noopener noreferrer">
            Route & terms
          </a>
          <span role="status">
            {copyError
              ? "Copy failed; use product link."
              : copied
                ? "Link copied"
                : ""}
          </span>
        </div>
      </div>
    </article>
  );
}
