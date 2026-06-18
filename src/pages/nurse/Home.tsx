// Nurse home dashboard: today's and this week's visits, expected pay, plus
// nudges for returned charts and unfinished drafts.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../../api";
import { useAuth } from "../../auth";
import { Appointment, Assessment } from "../../types";
import { AppSettings, DEFAULT_SETTINGS, nursePayFor, money } from "../../settings";

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "var(--navy)" }}>{value}</div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

function sameDay(iso: string, d: Date) {
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
}

export default function NurseHome() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [hras, setHras] = useState<Assessment[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/appointments").then((r) => setAppts(r.appointments || [])).catch((e) => setErr(e.message));
    apiGet("/api/assessments").then((r) => setHras(r.assessments || [])).catch(() => {});
    apiGet("/api/settings").then((r) => setSettings({ ...DEFAULT_SETTINGS, ...r.settings })).catch(() => {});
  }, []);

  const now = new Date();
  const weekEnd = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() + 7); return d; }, []);

  const today = appts.filter((a) => a.status === "scheduled" && sameDay(a.scheduled_at, now));
  const thisWeek = appts.filter((a) => a.status === "scheduled" && new Date(a.scheduled_at) > now && new Date(a.scheduled_at) <= weekEnd);
  const completed = appts.filter((a) => a.status === "completed");
  const expectedPay = completed.reduce((s, a) => s + nursePayFor(settings, a.visit_type), 0);

  const returned = hras.filter((h) => h.status === "returned");
  const drafts = hras.filter((h) => h.status === "draft");

  // Open (or create) an assessment for a visit, like the calendar flow.
  async function openVisit(a: Appointment) {
    try {
      const found = hras.find((x) => x.appointment_id === a.id || x.patient_id === a.patient_id);
      if (found) { nav(`/assessments/${found.id}`); return; }
      const r = await apiPost("/api/assessments", { patient_id: a.patient_id, appointment_id: a.id });
      nav(`/assessments/${r.assessment.id}`);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Could not open the visit"); }
  }

  return (
    <div>
      <h1 className="page">Welcome back{profile ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
      {err && <div className="error">{err}</div>}

      <div className="row" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <Stat label="Today's visits" value={today.length} />
        <Stat label="Next 7 days" value={thisWeek.length} />
        <Stat label="Completed" value={completed.length} color="var(--green)" />
        <Stat label="Expected pay" value={money(expectedPay)} color="var(--green)" />
      </div>

      {(returned.length > 0 || drafts.length > 0) && (
        <div className="card" style={{ marginBottom: 16, borderColor: "#f5d9a8" }}>
          <h3 style={{ marginTop: 0 }}>Needs your attention</h3>
          {returned.map((h) => (
            <div className="hca" key={h.id}>
              <span className="pill bad">returned</span>
              <span>{h.patient_name}</span>
              {h.doctor_notes && <span className="muted" style={{ fontSize: 12 }}>— {h.doctor_notes}</span>}
              <Link className="btn secondary" style={{ marginLeft: "auto" }} to={`/assessments/${h.id}`}>Fix &amp; resubmit</Link>
            </div>
          ))}
          {drafts.map((h) => (
            <div className="hca" key={h.id}>
              <span className="pill blue">draft</span>
              <span>{h.patient_name}</span>
              <Link className="btn secondary" style={{ marginLeft: "auto" }} to={`/assessments/${h.id}`}>Resume</Link>
            </div>
          ))}
        </div>
      )}

      <h3>Today</h3>
      <div className="card" style={{ padding: 0, marginBottom: 18 }}>
        <table>
          <thead><tr><th>Time</th><th>Patient</th><th>Type</th><th>Pay</th><th></th></tr></thead>
          <tbody>
            {today.length === 0 && <tr><td colSpan={5} className="muted">No visits today.</td></tr>}
            {today.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((a) => (
              <tr key={a.id}>
                <td className="muted">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                <td>{a.patient_name}</td>
                <td>{a.visit_type}</td>
                <td>{money(nursePayFor(settings, a.visit_type))}</td>
                <td style={{ textAlign: "right" }}><button className="btn" onClick={() => openVisit(a)}>Open visit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>This week</h3>
      <div className="card" style={{ padding: 0, marginBottom: 18 }}>
        <table>
          <thead><tr><th>When</th><th>Patient</th><th>Type</th><th>Pay</th></tr></thead>
          <tbody>
            {thisWeek.length === 0 && <tr><td colSpan={4} className="muted">Nothing in the next 7 days.</td></tr>}
            {thisWeek.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((a) => (
              <tr key={a.id}>
                <td className="muted">{new Date(a.scheduled_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</td>
                <td>{a.patient_name}</td>
                <td>{a.visit_type}</td>
                <td>{money(nursePayFor(settings, a.visit_type))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Completed visits</h3>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>When</th><th>Patient</th><th>Type</th><th>Pay</th></tr></thead>
          <tbody>
            {completed.length === 0 && <tr><td colSpan={4} className="muted">No completed visits yet.</td></tr>}
            {completed.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)).map((a) => (
              <tr key={a.id}>
                <td className="muted">{new Date(a.scheduled_at).toLocaleDateString()}</td>
                <td>{a.patient_name}</td>
                <td>{a.visit_type}</td>
                <td>{money(nursePayFor(settings, a.visit_type))}</td>
              </tr>
            ))}
            {completed.length > 0 && (
              <tr><td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>Total expected pay</td><td style={{ fontWeight: 700, color: "var(--green)" }}>{money(expectedPay)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
