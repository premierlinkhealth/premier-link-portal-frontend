// HCC / V28 / RAF coding panel.
//
// Lets the nurse confirm chronic conditions (HCC codes), add new ones via an
// ICD-10 typeahead against the full CMS V28 dictionary, see each code's RAF
// weight + "money" framing, and a running RAF total. Read-only for reviewers.

import { useState } from "react";
import {
  ICD10,
  HCC_V28,
  IcdEntry,
  ConfirmedCode,
  icdSearch,
  rafTier,
  rafTagText,
  rafOf,
  toConfirmed,
  rafTotal,
  rafTotalMoney,
  relatedFor,
} from "../coding";

function RafPill({ hcc }: { hcc: number }) {
  const tier = rafTier(hcc);
  if (!tier) return null;
  return (
    <span className={`pill ${tier}`} title="Demo RAF weight (V28 community) — verify against the CMS Rate Announcement">
      {rafTagText(hcc)}
    </span>
  );
}

export default function CodingPanel({
  confirmed,
  onChange,
  editable,
}: {
  confirmed: ConfirmedCode[];
  onChange: (next: ConfirmedCode[]) => void;
  editable: boolean;
}) {
  const [q, setQ] = useState("");
  const results: IcdEntry[] = q.trim().length >= 2 ? icdSearch(q) : [];

  function add(e: IcdEntry) {
    if (confirmed.some((c) => c.code === e[0] || c.hcc === e[2])) {
      setQ("");
      return;
    }
    onChange([...confirmed, toConfirmed(e)]);
    setQ("");
  }
  function remove(code: string) {
    onChange(confirmed.filter((c) => c.code !== code));
  }

  const total = rafTotal(confirmed);
  // Grouping hints based on the highest-value confirmed code.
  const topHcc = confirmed.slice().sort((a, b) => (rafOf(b.hcc) || 0) - (rafOf(a.hcc) || 0))[0];
  const hints = topHcc ? relatedFor(topHcc.hcc, confirmed) : [];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>HCC condition review &amp; coding (CMS-HCC V28)</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Confirm only conditions documented at today's visit. RAF tags are demo V28 community weights for
        planning — verify against the CMS Rate Announcement before anything billing-related.
      </p>

      {confirmed.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>No codes confirmed yet.</p>
      ) : (
        confirmed.map((c) => (
          <div className="hca" key={c.code}>
            <span style={{ fontWeight: 600 }}>{c.label}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {c.code} · HCC {c.hcc}
              {HCC_V28[String(c.hcc)] ? ` — ${HCC_V28[String(c.hcc)]}` : ""}
            </span>
            <RafPill hcc={c.hcc} />
            {editable && (
              <a className="photo-tile rm" style={{ marginLeft: "auto", cursor: "pointer" }} onClick={() => remove(c.code)}>
                remove
              </a>
            )}
          </div>
        ))
      )}

      {editable && (
        <div className="field sugg" style={{ marginTop: 12 }}>
          <label>
            Add a condition found today{" "}
            <span className="muted" style={{ fontWeight: 400 }}>(auto-completes from the CMS V28 list)</span>
          </label>
          <input
            value={q}
            placeholder="Type a code or condition — e.g. E11.22 or chronic kidney"
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
          />
          {results.length > 0 && (
            <div className="sugg-list">
              {results.map((e) => (
                <div
                  className="sugg-item"
                  key={e[0]}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    add(e);
                  }}
                >
                  <b>{e[0]}</b> {e[1]} <span className="muted">· HCC {e[2]}</span>
                  <br />
                  <RafPill hcc={e[2]} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editable && hints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Often documented together (V28 groupings) — click to search:
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
            {hints.map((h) => (
              <span
                key={h.n}
                className="pill blue"
                style={{ cursor: "pointer" }}
                onClick={() => setQ(h.label.split(",")[0])}
              >
                HCC {h.n} · {h.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="raf-summary">
        <span>
          <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Running RAF total
          </span>
          <br />
          <span className="big">{total.toFixed(3)}</span>
        </span>
        <span>
          <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Est. annual value (demo)
          </span>
          <br />
          <span className="money">{rafTotalMoney(total)}</span>
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {confirmed.length} HCC{confirmed.length === 1 ? "" : "s"} ·{" "}
          {ICD10.length.toLocaleString()} ICD-10 codes loaded
        </span>
      </div>
    </div>
  );
}
