import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../../api";
import { Appointment } from "../../types";
import Calendar from "../../components/Calendar";

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

  // Clicking a visit on the calendar opens its assessment (creating a draft if
  // none exists yet), matching the old "open visit" flow.
  async function openVisit(a: Appointment) {
    try {
      const existing = await apiGet("/api/assessments");
      const found = (existing.assessments || []).find(
        (x: { patient_id: string; appointment_id: string | null; id: string }) =>
          x.appointment_id === a.id || x.patient_id === a.patient_id
      );
      if (found) { nav(`/assessments/${found.id}`); return; }
      const r = await apiPost("/api/assessments", { patient_id: a.patient_id, appointment_id: a.id });
      nav(`/assessments/${r.assessment.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not open the visit");
    }
  }

  return (
    <div>
      <div className="spread">
        <div>
          <h1 className="page">My Schedule</h1>
          <p className="muted" style={{ marginTop: 0 }}>Your assigned Annual Wellness Visits.</p>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      {loading ? <div className="center-note">Loading…</div> : (
        <Calendar appointments={items} showNurse={false} onOpen={openVisit} />
      )}
    </div>
  );
}
