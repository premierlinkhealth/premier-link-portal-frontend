// Known-HCC-conditions editor with ICD-10 autocomplete (CMS V28 list).
// Stores structured { code, label, hcc } objects so the visit delta engine and
// the HRA pre-population can read them directly. Shows a RAF "money" pill per
// condition and a running RAF total — the prototype's coding story, on the
// patient record.

import { useState } from "react";
import {
  IcdEntry,
  icdSearch,
  toConfirmed,
  rafTier,
  rafTagText,
  rafTotal,
  rafTotalMoney,
} from "../coding";
import { PatientCondition } from "../types";

export default function ConditionsEditor({
  value,
  onChange,
}: {
  value: PatientCondition[];
  onChange: (next: PatientCondition[]) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results: IcdEntry[] = q.trim().length >= 2 ? icdSearch(q) : [];

  function add(e: IcdEntry) {
    const c = toConfirmed(e); // { code, label, hcc, raf }
    if (!value.some((v) => v.code === c.code || v.hcc === c.hcc)) {
      onChange([...value, { code: c.code, label: c.label, hcc: c.hcc }]);
    }
    setQ("");
    setOpen(false);
  }
  function remove(code: string) {
    onChange(value.filter((v) => v.code !== code));
  }

  const total = rafTotal(value.map((v) => toConfirmed([v.code, v.label, v.hcc])));

  return (
    <div>
      <label>
        Known HCC conditions{" "}
        <span className="muted" style={{ fontWeight: 400 }}>(auto-completes from the CMS V28 list)</span>
      </label>

      {value.map((c) => (
        <div className="hca" key={c.code}>
          <span className="pill blue">HCC {c.hcc}</span>
          <span style={{ fontWeight: 600 }}>{c.label}</span>
          <span className="muted" style={{ fontSize: 12 }}>{c.code}</span>
          {rafTier(c.hcc) && <span className={`pill ${rafTier(c.hcc)}`}>{rafTagText(c.hcc)}</span>}
          <button
            type="button"
            className="btn ghost"
            style={{ marginLeft: "auto", padding: "2px 8px" }}
            onClick={() => remove(c.code)}
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="field sugg" style={{ marginTop: 10, marginBottom: 0 }}>
        <input
          value={q}
          placeholder="Search ICD-10 code or condition…"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && results.length > 0 && (
          <div className="sugg-list">
            {results.map((e) => (
              <div className="sugg-item" key={e[0]} onMouseDown={() => add(e)}>
                <b>{e[0]}</b> — {e[1]}{" "}
                <span className="muted">· HCC {e[2]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="raf-summary" style={{ marginTop: 12 }}>
          <span>
            <span className="muted" style={{ fontSize: 12 }}>Chart RAF total</span>
            <br />
            <span className="big">{total.toFixed(3)}</span>
          </span>
          <span>
            <span className="muted" style={{ fontSize: 12 }}>Est. annual value (demo)</span>
            <br />
            <span className="money">{rafTotalMoney(total)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Tolerantly read hcc_history (any past shape) into structured conditions. */
export function readConditions(hccHistory: unknown): PatientCondition[] {
  if (!Array.isArray(hccHistory)) return [];
  const out: PatientCondition[] = [];
  for (const item of hccHistory) {
    if (item && typeof item === "object" && "code" in (item as object)) {
      const o = item as Record<string, unknown>;
      if (typeof o.code === "string" && typeof o.hcc !== "undefined") {
        out.push({ code: o.code, label: String(o.label ?? o.code), hcc: Number(o.hcc) });
      }
    }
    // Legacy string entries (e.g. "Diabetes… (E1142) — HCC 37") are shown read-only
    // on the detail screen via a separate path; we skip them here so the editor
    // only manages clean structured codes.
  }
  return out;
}
