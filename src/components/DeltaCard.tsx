// "What changed this visit" — the prototype's signature review screen.
// A one-line summary (used in the queue) and a full card (used at the top of a
// chart) that show added / resolved / carried conditions, net RAF, and ≈$/yr.

import { ConfirmedCode, rafTier, rafTagText } from "../coding";
import { computeDelta, rafDeltaMoney, PriorCond, VisitDelta } from "../delta";

function RafPill({ hcc }: { hcc: number }) {
  const tier = rafTier(hcc);
  if (!tier) return null;
  return <span className={`pill ${tier}`}>{rafTagText(hcc)}</span>;
}

/** Compact, inline summary for a queue row: "3 on chart · +2 added · +0.6 RAF ≈$7.2k/yr". */
export function DeltaSummary({ delta }: { delta: VisitDelta }) {
  const { added, resolved, baseCount, rafDelta } = delta;
  return (
    <span style={{ fontSize: 13 }}>
      <span className="muted">{baseCount} on chart</span>
      {added.length > 0 && (
        <>
          {" · "}
          <b style={{ color: "var(--green)" }}>+{added.length} added</b>
        </>
      )}
      {resolved.length > 0 && (
        <>
          {" · "}
          {resolved.length} resolved
        </>
      )}
      {Math.abs(rafDelta) > 0.001 && (
        <>
          {" · "}
          <span className={`pill ${rafDelta > 0 ? "raf-hi" : "raf-lo"}`}>
            {(rafDelta > 0 ? "+" : "−") + Math.abs(rafDelta).toFixed(3)} RAF · {rafDeltaMoney(rafDelta)}
          </span>
        </>
      )}
      {added.length === 0 && resolved.length === 0 && (
        <>
          {" · "}
          <span className="muted">no change</span>
        </>
      )}
    </span>
  );
}

function ConfRow({ tag, cls, c }: { tag: string; cls: string; c: ConfirmedCode }) {
  return (
    <div className="hca">
      <span className={`pill ${cls}`}>{tag}</span>
      <span style={{ fontWeight: 600 }}>{c.label}</span>
      <span className="muted" style={{ fontSize: 12 }}>
        {c.code} · HCC {c.hcc}
      </span>
      <RafPill hcc={c.hcc} />
    </div>
  );
}

function PriorRow({ tag, cls, p }: { tag: string; cls: string; p: PriorCond }) {
  return (
    <div className="hca">
      <span className={`pill ${cls}`}>{tag}</span>
      <span style={{ fontWeight: 600 }}>{p.label}</span>
      {p.hcc != null && (
        <span className="muted" style={{ fontSize: 12 }}>
          HCC {p.hcc}
        </span>
      )}
      {p.hcc != null && <RafPill hcc={p.hcc} />}
    </div>
  );
}

/** Full delta card for the top of a chart-review screen. */
export default function DeltaCard({
  hccHistory,
  confirmed,
}: {
  hccHistory: unknown;
  confirmed: ConfirmedCode[];
}) {
  const d = computeDelta(hccHistory, confirmed);
  const nothing = d.added.length === 0 && d.resolved.length === 0 && d.carried.length === 0;

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--teal, #1f9d8f)" }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>What changed this visit</h3>
      <div style={{ marginBottom: nothing ? 0 : 12 }}>
        <DeltaSummary delta={d} />
      </div>
      {d.added.map((c) => (
        <ConfRow key={`a-${c.code}`} tag="➕ ADDED" cls="good" c={c} />
      ))}
      {d.resolved.map((p, i) => (
        <PriorRow key={`r-${p.hcc ?? p.label}-${i}`} tag="➖ RESOLVED" cls="warn" p={p} />
      ))}
      {d.carried.map((c) => (
        <ConfRow key={`c-${c.code}`} tag="CARRIED" cls="blue" c={c} />
      ))}
      {nothing && <p className="muted" style={{ margin: 0 }}>No conditions recorded for this visit yet.</p>}
    </div>
  );
}
