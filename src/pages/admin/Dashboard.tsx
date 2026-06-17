import { useEffect, useState } from "react";
import { apiGet } from "../../api";

interface Dash {
  appointments: { scheduled: string; completed: string; pending: string };
  assessments: { submitted: string; approved: string; returned: string; draft: string };
  per_nurse: { id: string; full_name: string; visits_completed: string; hras_approved: string; hras_total: string }[];
  per_doctor: { id: string; full_name: string; approved: string; returned: string }[];
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--navy)" }}>{value ?? 0}</div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/dashboard").then((r) => setD(r)).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!d) return <div className="center-note">Loading…</div>;

  return (
    <div>
      <h1 className="page">Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>Operation-wide view of visits and assessments.</p>

      <h3>Visits</h3>
      <div className="row" style={{ marginBottom: 20 }}>
        <Stat label="Scheduled" value={d.appointments.scheduled} />
        <Stat label="Completed" value={d.appointments.completed} color="var(--green)" />
        <Stat label="Pending" value={d.appointments.pending} color="var(--amber)" />
      </div>

      <h3>Assessments</h3>
      <div className="row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        <Stat label="Draft" value={d.assessments.draft} />
        <Stat label="Submitted" value={d.assessments.submitted} color="var(--amber)" />
        <Stat label="Approved" value={d.assessments.approved} color="var(--green)" />
        <Stat label="Returned" value={d.assessments.returned} color="var(--red)" />
      </div>

      <h3>Per nurse</h3>
      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <table>
          <thead><tr><th>Nurse</th><th>Visits completed</th><th>Assessments</th><th>Approved</th></tr></thead>
          <tbody>
            {d.per_nurse.length === 0 && <tr><td colSpan={4} className="muted">No nurses yet.</td></tr>}
            {d.per_nurse.map((n) => (
              <tr key={n.id}><td>{n.full_name}</td><td>{n.visits_completed}</td><td>{n.hras_total}</td><td>{n.hras_approved}</td></tr>
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
