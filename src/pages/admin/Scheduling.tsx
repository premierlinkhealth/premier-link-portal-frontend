import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api";
import { Appointment, Patient, AppUser } from "../../types";

export default function Scheduling() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [nurses, setNurses] = useState<AppUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ patient_id: "", nurse_id: "", scheduled_at: "", location: "", visit_type: "AWV" });

  async function load() {
    try {
      const [a, p, u] = await Promise.all([apiGet("/api/appointments"), apiGet("/api/patients"), apiGet("/api/users")]);
      setAppts(a.appointments); setPatients(p.patients);
      setNurses((u.users as AppUser[]).filter((x) => x.role === "nurse"));
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await apiPost("/api/appointments", {
        patient_id: form.patient_id,
        nurse_id: form.nurse_id || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        location: form.location || null,
        visit_type: form.visit_type,
      });
      setForm({ patient_id: "", nurse_id: "", scheduled_at: "", location: "", visit_type: "AWV" });
      load();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page">Scheduling</h1>
      {err && <div className="error">{err}</div>}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Create a visit</h3>
        <form onSubmit={create}>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Patient</label>
              <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required>
                <option value="">Select…</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}><label>Assign nurse</label>
              <select value={form.nurse_id} onChange={(e) => setForm({ ...form, nurse_id: e.target.value })}>
                <option value="">Unassigned</option>
                {nurses.map((n) => <option key={n.id} value={n.id}>{n.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Date &amp; time</label><input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Visit type</label>
              <select value={form.visit_type} onChange={(e) => setForm({ ...form, visit_type: e.target.value })}>
                <option>AWV</option><option>Telehealth</option>
              </select>
            </div>
          </div>
          <div className="field"><label>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Address or 'Telehealth'" /></div>
          <button className="btn" disabled={busy}>Create visit</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Patient</th><th>Nurse</th><th>When</th><th>Status</th></tr></thead>
          <tbody>
            {appts.length === 0 && <tr><td colSpan={4} className="muted">No visits yet.</td></tr>}
            {appts.map((a) => (
              <tr key={a.id}>
                <td>{a.patient_name}</td><td>{a.nurse_name || "—"}</td>
                <td>{new Date(a.scheduled_at).toLocaleString()}</td>
                <td><span className={`badge ${a.status}`}>{a.status.replace("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
