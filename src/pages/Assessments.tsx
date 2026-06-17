import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { Assessment } from "../types";

export default function Assessments({ scope }: { scope: "mine" | "all" }) {
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/assessments")
      .then((r) => setItems(r.assessments))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="page">{scope === "mine" ? "My Assessments" : "All Assessments"}</h1>
      {err && <div className="error">{err}</div>}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Patient</th>{scope === "all" && <th>Nurse</th>}<th>Status</th><th>Doctor</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="muted">Nothing here yet.</td></tr>}
            {items.map((a) => (
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
