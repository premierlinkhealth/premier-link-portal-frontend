import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../../api";
import { AppSettings, DEFAULT_SETTINGS, rateFor, money } from "../../settings";

interface FeedAppt { id: string; scheduled_at: string; visit_type: string; status: string; nurse_id: string | null; patient_name: string; nurse_name: string | null; }
interface FeedHra { id: string; status: string; updated_at: string; patient_name: string; nurse_name: string | null; }
interface Breakdown { medical_group: string; visit_type: string; count: number; }
interface Dash {
  appointments: { scheduled: string; completed: string; pending: string; unassigned: string };
  assessments: { submitted: string; approved: string; returned: string; draft: string };
  per_nurse: { id: string; full_name: string; visits_completed: string; hras_approved: string; hras_total: string }[];
  per_doctor: { id: string; full_name: string; approved: string; returned: string }[];
  upcoming: FeedAppt[];
  latest_hras: FeedHra[];
  completed_breakdown: Breakdown[];
}

function Stat({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 130, cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--navy)" }}>{value ?? 0}</div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    apiGet("/api/dashboard").then((r) => setD(r)).catch((e) => setErr(e.message));
    apiGet("/api/settings").then((r) => setSettings({ ...DEFAULT_SETTINGS, ...r.settings })).catch(() => {});
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!d) return <div className="center-note">Loading…</div>;

  const completed = Number(d.appointments.completed || 0);
  // Real revenue: sum each completed-visit group×type bucket at its contracted rate.
  const revenue = (d.completed_breakdown || []).reduce(
    (sum, b) => sum + b.count * rateFor(settings, b.medical_group === "—" ? null : b.medical_group, b.visit_type),
    0
  );
  const unassigned = Number(d.appointments.unassigned || 0);

  return (
    <div>
      <h1 className="page">Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>Operation-wide view of visits, assessments, and throughput.</p>

      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <Stat label="Scheduled" value={d.appointments.scheduled} onClick={() => nav("/scheduling")} />
        <Stat label="Completed" value={completed} color="var(--green)" />
        <Stat label="Unassigned" value={unassigned} color={unassigned ? "var(--red)" : "var(--navy)"} onClick={() => nav("/scheduling")} />
        <Stat label="Revenue (completed)" value={money(revenue)} color="var(--green)" />
      </div>

      <div className="row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        <Stat label="HRAs draft" value={d.assessments.draft} />
        <Stat label="Submitted" value={d.assessments.submitted} color="var(--amber)" onClick={() => nav("/assessments")} />
        <Stat label="Approved" value={d.assessments.approved} color="var(--green)" />
        <Stat label="Returned" value={d.assessments.returned} color="var(--red)" />
      </div>

      <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h3>Upcoming visits</h3>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>When</th><th>Patient</th><th>Nurse</th></tr></thead>
              <tbody>
                {d.upcoming.length === 0 && <tr><td colSpan={3} className="muted">Nothing scheduled.</td></tr>}
                {d.upcoming.map((a) => (
                  <tr key={a.id}>
                    <td className="muted" style={{ fontSize: 13 }}>{new Date(a.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td>{a.patient_name}</td>
                    <td>{a.nurse_name || <span className="pill bad">unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h3>Latest HRA activity</h3>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Patient</th><th>Nurse</th><th>Status</th></tr></thead>
              <tbody>
                {d.latest_hras.length === 0 && <tr><td colSpan={3} className="muted">No activity yet.</td></tr>}
                {d.latest_hras.map((h) => (
                  <tr key={h.id} style={{ cursor: "pointer" }} onClick={() => nav(`/assessments/${h.id}`)}>
                    <td>{h.patient_name}</td>
                    <td>{h.nurse_name}</td>
                    <td><span className={`badge ${h.status}`}>{h.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h3>Per nurse</h3>
      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <table>
          <thead><tr><th>Nurse</th><th>Visits completed</th><th>Assessments</th><th>Approved</th><th></th></tr></thead>
          <tbody>
            {d.per_nurse.length === 0 && <tr><td colSpan={5} className="muted">No nurses yet.</td></tr>}
            {d.per_nurse.map((n) => (
              <tr key={n.id}>
                <td><b>{n.full_name}</b></td><td>{n.visits_completed}</td><td>{n.hras_total}</td><td>{n.hras_approved}</td>
                <td style={{ textAlign: "right" }}><Link className="btn secondary" to="/nurses">Profile</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Per doctor</h3>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Doctor</th><th>Approved</th><th>Returned</th></tr></thead>
          <tbody>
            {d.per_doctor.length === 0 && <tr><td colSpan={3} className="muted">No doctors yet.</td></tr>}
            {d.per_doctor.map((x) => (
              <tr key={x.id}><td>{x.full_name}</td><td>{x.approved}</td><td>{x.returned}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
