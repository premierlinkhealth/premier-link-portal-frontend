import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { Assessment, HraStatus } from "../types";

const STATUSES: (HraStatus | "all")[] = ["all", "draft", "submitted", "approved", "returned"];

export default function Assessments({ scope }: { scope: "mine" | "all" }) {
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<HraStatus | "all">("all");
  const [nurse, setNurse] = useState("");

  useEffect(() => {
    apiGet("/api/assessments")
      .then((r) => setItems(r.assessments))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const nurses = useMemo(
    () => Array.from(new Set(items.map((a) => a.nurse_name).filter(Boolean))) as string[],
    [items]
  );

  const filtered = items.filter((a) => {
    if (status !== "all" && a.status !== status) return false;
    if (scope === "all" && nurse && a.nurse_name !== nurse) return false;
    const ql = q.trim().toLowerCase();
    if (!ql) return true;
    return [a.patient_name, a.nurse_name, a.doctor_name].some((v) => String(v || "").toLowerCase().includes(ql));
  });

  return (
    <div>
      <h1 className="page">{scope === "mine" ? "My Assessments" : "All Assessments"}</h1>
      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient, nurse, or doctor…" />
          </div>
          <div className="field" style={{ width: 160, marginBottom: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as HraStatus | "all")}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All" : s}</option>)}
            </select>
          </div>
          {scope === "all" && (
            <div className="field" style={{ width: 180, marginBottom: 0 }}>
              <label>Nurse</label>
              <select value={nurse} onChange={(e) => setNurse(e.target.value)}>
                <option value="">All</option>{nurses.map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
          )}
          {(q || status !== "all" || nurse) && (
            <button className="btn ghost" onClick={() => { setQ(""); setStatus("all"); setNurse(""); }}>Clear</button>
          )}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>{filtered.length} of {items.length}</p>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Patient</th>{scope === "all" && <th>Nurse</th>}<th>Status</th><th>Doctor</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="muted">Nothing matches.</td></tr>}
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>{a.patient_name}</td>
                {scope === "all" && <td>{a.nurse_name}</td>}
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                <td>{a.doctor_name || "—"}</td>
                <td style={{ textAlign: "right" }}><Link className="btn secondary" to={`/assessments/${a.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
