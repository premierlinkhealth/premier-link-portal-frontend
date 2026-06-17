import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../api";
import { Assessment } from "../../types";

export default function ReviewQueue() {
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/assessments")
      .then((r) => setItems(r.assessments))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const pending = items.filter((a) => a.status === "submitted");
  const done = items.filter((a) => a.status !== "submitted");

  return (
    <div>
      <h1 className="page">Review Queue</h1>
      <p className="muted" style={{ marginTop: 0 }}>Submitted assessments awaiting your sign-off.</p>
      {err && <div className="error">{err}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <table>
          <thead><tr><th>Patient</th><th>Nurse</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="muted">Loading…</td></tr>}
            {!loading && pending.length === 0 && <tr><td colSpan={4} className="muted">Nothing waiting for review.</td></tr>}
            {pending.map((a) => (
              <tr key={a.id}>
                <td>{a.patient_name}</td><td>{a.nurse_name}</td>
                <td><span className="badge submitted">submitted</span></td>
                <td style={{ textAlign: "right" }}><Link className="btn" to={`/assessments/${a.id}`}>Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {done.length > 0 && (
        <>
          <h3>Recently acted on</h3>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Patient</th><th>Nurse</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {done.map((a) => (
                  <tr key={a.id}>
                    <td>{a.patient_name}</td><td>{a.nurse_name}</td>
                    <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                    <td style={{ textAlign: "right" }}><Link className="btn secondary" to={`/assessments/${a.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
