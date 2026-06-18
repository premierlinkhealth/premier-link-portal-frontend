import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../api";
import { Assessment } from "../../types";
import { ConfirmedCode } from "../../coding";
import { computeDelta, queueStats, hoursWaiting, waitLabel } from "../../delta";
import { DeltaSummary } from "../../components/DeltaCard";

function StatCard({
  icon,
  value,
  label,
  tone,
  to,
}: {
  icon: string;
  value: string | number;
  label: string;
  tone?: "good" | "bad";
  to?: string;
}) {
  const inner = (
    <div className="statcard">
      <div className="statcard-ic">{icon}</div>
      <div
        className="statcard-n"
        style={tone === "bad" ? { color: "var(--red)" } : tone === "good" ? { color: "var(--green)" } : undefined}
      >
        {value}
      </div>
      <div className="statcard-l">{label}</div>
    </div>
  );
  return to ? <Link to={to} className="statcard-link">{inner}</Link> : inner;
}

function confirmedOf(a: Assessment): ConfirmedCode[] {
  return ((a.form_data?.confirmed_codes as ConfirmedCode[]) || []);
}

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

  // Sort longest-waiting first so the chart closest to the 48h promise is on top.
  const pending = items
    .filter((a) => a.status === "submitted")
    .sort((a, b) => hoursWaiting(b) - hoursWaiting(a));
  const done = items.filter((a) => a.status !== "submitted");

  const s = queueStats(items);

  return (
    <div>
      <h1 className="page">Review Queue</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Charts ready for your sign-off — deltas pre-flagged, evidence attached.
      </p>
      {err && <div className="error">{err}</div>}

      <div className="statgrid">
        <StatCard icon="📥" value={s.waiting} label="Waiting for review" />
        <StatCard
          icon="⏱️"
          value={s.waiting ? waitLabel(s.oldestWaitHours) : "—"}
          label="Oldest wait"
          tone={s.oldestWaitHours > 48 ? "bad" : "good"}
        />
        <StatCard icon="✍️" value={s.signedThisWeek} label="Signed this week" />
        <StatCard icon="⚡" value={s.avgTurnaroundHours ? waitLabel(s.avgTurnaroundHours) : "—"} label="Avg turnaround" />
      </div>

      {!loading && (
        <div className="note" style={{ marginTop: 14, marginBottom: 18 }}>
          {s.breaches48h === 0 ? (
            <span>
              <b style={{ color: "var(--green)" }}>✓ Inside the 48-hour promise.</b> Every waiting chart is under 48 hours old.
            </span>
          ) : (
            <span>
              <b style={{ color: "var(--red)" }}>⚠ {s.breaches48h} chart{s.breaches48h > 1 ? "s" : ""} past the 48-hour promise.</b>{" "}
              Prioritize the oldest waits below.
            </span>
          )}
        </div>
      )}

      <div className="card" style={{ padding: pending.length ? "8px 6px" : 0, marginBottom: 20 }}>
        {loading && <p className="muted" style={{ padding: 12 }}>Loading…</p>}
        {!loading && pending.length === 0 && (
          <p className="muted" style={{ padding: 12, margin: 0 }}>Queue is clear — every completed visit is signed. 🎉</p>
        )}
        {pending.map((a) => {
          const hrs = hoursWaiting(a);
          const delta = computeDelta(a.form_data?.hcc_history, confirmedOf(a));
          return (
            <div className="hca" key={a.id} style={{ alignItems: "flex-start", padding: "13px 10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 15 }}>{a.patient_name}</b>
                  <span className={`pill ${hrs > 36 ? "bad" : "blue"}`}>waiting {waitLabel(hrs)}</span>
                </div>
                <div style={{ marginTop: 5 }}>
                  <DeltaSummary delta={delta} />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Nurse: {a.nurse_name}</div>
              </div>
              <Link className="btn" to={`/assessments/${a.id}`}>Review chart →</Link>
            </div>
          );
        })}
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
