import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api";
import { Patient } from "../../types";

export default function Patients() {
  const [items, setItems] = useState<Patient[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", date_of_birth: "", insurance_id: "", notes: "" });

  async function load() {
    try { const r = await apiGet("/api/patients"); setItems(r.patients); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await apiPost("/api/patients", { ...form, insurance_id: form.insurance_id || null, notes: form.notes || null });
      setForm({ full_name: "", date_of_birth: "", insurance_id: "", notes: "" });
      load();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page">Patients</h1>
      {err && <div className="error">{err}</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Add a patient</h3>
        <form onSubmit={create}>
          <div className="field"><label>Full name</label><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Date of birth</label><input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Insurance ID</label><input value={form.insurance_id} onChange={(e) => setForm({ ...form, insurance_id: e.target.value })} /></div>
          </div>
          <div className="field"><label>Known condition history / notes</label><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button className="btn" disabled={busy}>Add patient</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>DOB</th><th>Insurance</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={3} className="muted">No patients yet.</td></tr>}
            {items.map((p) => (
              <tr key={p.id}><td>{p.full_name}</td><td>{p.date_of_birth}</td><td>{p.insurance_id || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
