// HCC / V28 reference lookup — search any ICD-10 code or condition, or browse
// HCC categories ranked by RAF value. Read-only; a credibility tool for the
// coding story. Available to every role.

import { useMemo, useState } from "react";
import { ICD10, HCC_V28, HCC_RAF, icdSearch, rafOf, rafMoney, rafTier, rafTagText } from "../coding";

// Precompute ICD count per HCC category (cheap, runs once per module load).
const COUNT_BY_HCC: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const e of ICD10) m[String(e[2])] = (m[String(e[2])] || 0) + 1;
  return m;
})();

export default function HccReference() {
  const [q, setQ] = useState("");

  const codeHits = useMemo(() => (q.trim().length >= 2 ? icdSearch(q) : []), [q]);

  const categories = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return Object.keys(HCC_V28)
      .map((k) => ({ hcc: k, label: HCC_V28[k], raf: HCC_RAF[k] ?? 0, count: COUNT_BY_HCC[k] || 0 }))
      .filter((c) => !ql || c.label.toLowerCase().includes(ql) || c.hcc.includes(ql))
      .sort((a, b) => b.raf - a.raf);
  }, [q]);

  return (
    <div>
      <h1 className="page">HCC / V28 reference</h1>
      <p className="muted" style={{ marginTop: 0 }}>Search an ICD-10 code or condition, or browse HCC categories by RAF value.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. E1142, diabetes, heart failure…" />
        </div>
      </div>

      {codeHits.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Matching ICD-10 codes</h3>
          {codeHits.map((e) => (
            <div className="hca" key={e[0]}>
              <span className="pill blue">{e[0]}</span>
              <span style={{ fontWeight: 600 }}>{e[1]}</span>
              <span className="muted" style={{ fontSize: 12 }}>HCC {e[2]} — {HCC_V28[String(e[2])] || "—"}</span>
              {rafTier(e[2]) && <span className={`pill ${rafTier(e[2])}`} style={{ marginLeft: "auto" }}>{rafTagText(e[2])}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>HCC</th><th>Category</th><th>RAF</th><th>Est. $/yr</th><th>ICD codes</th></tr></thead>
          <tbody>
            {categories.length === 0 && <tr><td colSpan={5} className="muted">No categories match.</td></tr>}
            {categories.map((c) => (
              <tr key={c.hcc}>
                <td><b>{c.hcc}</b></td>
                <td>{c.label}</td>
                <td>{c.raf ? c.raf.toFixed(3) : "—"}</td>
                <td>{rafOf(c.hcc) != null ? <span className={`pill ${rafTier(c.hcc)}`}>{rafMoney(c.hcc)}</span> : "—"}</td>
                <td className="muted">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
