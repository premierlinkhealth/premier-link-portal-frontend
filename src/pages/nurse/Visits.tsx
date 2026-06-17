import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPatch } from "../../api";
import { Appointment } from "../../types";

export default function Visits() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet("/api/appointments");
      setItems(r.appointments);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function startAssessment(a: Appointment) {
    const r = await apiPost("/api/assessments", { patient_id: a.patient_id, appointment_id: a.id });
    nav(`/assessments/${r.assessment.id}`);
  }
  async function setStatus(a: Appointment, status: string) {
    await apiPatch(`/api/appointments/${a.id}/status`, { status });
    load();
  }

  return (
    <div>
      <h1 className="page">My Visits</h1>
      <p className="muted" style={{ marginTop: 0 }}>Your assigned Annual Wellness Visits.</p>
      {err && <div className="error">{err}</div>}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Patient</th><th>When</th><th>Type</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="muted">No visits assigned yet.</td></tr>}
            {items.map((a) => (
              <tr key={a.id}>
                <td>{a.patient_name}</td>
                <td>{new Date(a.scheduled_at).toLocaleString()}</td>
                <td>{a.visit_type}</td>
                <td><span className={`badge ${a.status}`}>{a.status.replace("_", " ")}</span></td>
                <td style={{ textAlign: "right" }}>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => startAssessment(a)}>Start assessment</button>
                    {a.status === "scheduled" && (
                      <button className="btn secondary" onClick={() => setStatus(a, "completed")}>Mark done</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
