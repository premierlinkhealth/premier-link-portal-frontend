import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../../api";
import { Patient } from "../../types";

export default function Patients() {
  const [items, setItems] = useState<Patient[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [lob, setLob] = useState("");
  const nav = useNavigate();

  async function load() {
    try { const r = await apiGet("/api/patients"); setItems(r.patients); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  const groups = useMemo(
    () => Array.from(new Set(items.map((p) => p.medical_group).filter(Boolean))) as string[],
    [items]
  );
  const lobs = useMemo(
    () => Array.from(new Set(items.map((p) => p.line_of_business).filter(Boolean))) as string[],
    [items]
  );

  const filtered = items.filter((p) => {
    if (group && p.medical_group !== group) return false;
    if (lob && p.line_of_business !== lob) return false;
    const ql = q.trim().toLowerCase();
    if (!ql) return true;
    return [p.full_name, p.member_id, p.date_of_birth, p.insurance_id, p.address_city]
      .some((v) => String(v || "").toLowerCase().includes(ql));
  });

  return (
    <div>
      <div className="spread">
        <h1 className="page">Patients</h1>
        <div className="row">
          <Link className="btn secondary" to="/patients/bulk">Bulk upload</Link>
          <Link className="btn" to="/patients/new">+ Add patient</Link>
        </div>
      </div>
      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, member ID, DOB, insurance, city…" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label>Medical group</label>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All</option>{groups.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label>Line of business</label>
            <select value={lob} onChange={(e) => setLob(e.target.value)}>
              <option value="">All</option>{lobs.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          {(q || group || lob) && (
            <button className="btn ghost" onClick={() => { setQ(""); setGroup(""); setLob(""); }}>Clear</button>
          )}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>{filtered.length} of {items.length} patients</p>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Member ID</th><th>Name</th><th>DOB</th><th>Medical group</th><th>Line of business</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} className="muted">No matching patients.</td></tr>}
            {filtered.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => nav(`/patients/${p.id}`)}>
                <td><b style={{ color: "var(--teal)" }}>{p.member_id || "—"}</b></td>
                <td><b>{p.full_name}</b></td>
                <td className="muted">{p.date_of_birth}</td>
                <td>{p.medical_group || "—"}</td>
                <td>{p.line_of_business || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
