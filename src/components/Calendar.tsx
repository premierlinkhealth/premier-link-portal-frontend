// Visit calendar — day / week / month / list views, ported from the original
// prototype and wired to the live appointments API. Restores the calendar the
// nurse/admin had before (the React rebuild had only a flat list).

import { useState } from "react";
import { Appointment } from "../types";

type View = "day" | "week" | "month" | "list";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const todayDate = new Date();
const TODAY = localISO(todayDate);

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const a = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${a}`;
}
function dayKey(a: Appointment): string { return localISO(new Date(a.scheduled_at)); }
function timeLabel(a: Appointment): string {
  return new Date(a.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date): Date { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; }
function parseISO(s: string): Date { return new Date(s + "T00:00:00"); }

function typeBadge(t: string) {
  const tele = /tele/i.test(t);
  return <span className={`vbadge ${tele ? "tele" : "home"}`}>{tele ? "Telehealth" : "In-person"}</span>;
}

export default function Calendar({
  appointments,
  showNurse,
  onOpen,
}: {
  appointments: Appointment[];
  showNurse: boolean;
  onOpen: (a: Appointment) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string>(TODAY);

  function nav(dir: number) {
    const a = parseISO(anchor);
    if (view === "day") setAnchor(localISO(addDays(a, dir)));
    else if (view === "week") setAnchor(localISO(addDays(a, dir * 7)));
    else if (view === "month") { const x = new Date(a); x.setMonth(x.getMonth() + dir); setAnchor(localISO(x)); }
  }
  function label(): string {
    const a = parseISO(anchor);
    if (view === "day") return a.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (view === "week") { const s = startOfWeek(a), e = addDays(s, 6); return `${MON[s.getMonth()].slice(0, 3)} ${s.getDate()} – ${MON[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`; }
    return `${MON[a.getMonth()]} ${a.getFullYear()}`;
  }
  const onDay = (k: string) => appointments.filter((a) => dayKey(a) === k).sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at));

  function statusClass(a: Appointment) {
    if (!a.nurse_id) return "unassigned";
    return a.status === "completed" ? "good" : a.status === "scheduled" ? "" : "warn";
  }

  function Appt({ a }: { a: Appointment }) {
    return (
      <div className={`appt ${statusClass(a)}`} onClick={() => onOpen(a)}>
        <div className="t">{timeLabel(a)}{!a.nurse_id ? " · ⚠ Unassigned" : ""}</div>
        <div className="nm">{a.patient_name}</div>
        <div className="w">{a.location || (/tele/i.test(a.visit_type) ? "Telehealth" : "")}</div>
        {typeBadge(a.visit_type)}
        {showNurse && a.nurse_name ? <div className="muted" style={{ fontSize: 11 }}>{a.nurse_name}</div> : null}
      </div>
    );
  }

  function WeekView() {
    const s = startOfWeek(parseISO(anchor));
    return (
      <div className="week-grid">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(s, i), k = localISO(d);
          return (
            <div key={i} className={`day-col ${k === TODAY ? "today" : ""}`}>
              <div className="dh">{DOW[i]} {d.getDate()}</div>
              {onDay(k).map((a) => <Appt key={a.id} a={a} />)}
            </div>
          );
        })}
      </div>
    );
  }
  function DayView() {
    const day = onDay(anchor);
    return (
      <div className="card day-list">
        {day.length === 0 ? <div className="center-note">No visits this day.</div> :
          day.map((a) => (
            <div key={a.id} className={`appt ${statusClass(a)}`} onClick={() => onOpen(a)} style={{ marginBottom: 8 }}>
              <div className="t">{timeLabel(a)} — {a.patient_name} {typeBadge(a.visit_type)}</div>
              <div className="muted" style={{ fontSize: 12 }}>{a.location || (/tele/i.test(a.visit_type) ? "Telehealth" : "")}{showNurse && a.nurse_name ? ` · ${a.nurse_name}` : ""}</div>
            </div>
          ))}
      </div>
    );
  }
  function MonthView() {
    const a = parseISO(anchor);
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const start = startOfWeek(first);
    return (
      <div className="month-grid">
        {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: 42 }).map((_, i) => {
          const d = addDays(start, i), k = localISO(d), out = d.getMonth() !== a.getMonth();
          const day = onDay(k);
          return (
            <div key={i} className={`mcell ${out ? "out" : ""} ${k === TODAY ? "today" : ""}`}
              onClick={() => { setView("day"); setAnchor(k); }}>
              <div className="dn">{d.getDate()}</div>
              {day.slice(0, 2).map((x) => (
                <div key={x.id} className="chip" style={!x.nurse_id ? { background: "#fde8e7", color: "#b3261e" } : undefined}
                  onClick={(e) => { e.stopPropagation(); onOpen(x); }}>
                  {timeLabel(x)} {x.patient_name?.split(" ")[0]}
                </div>
              ))}
              {day.length > 2 ? <div className="muted" style={{ fontSize: 11 }}>+{day.length - 2} more</div> : null}
            </div>
          );
        })}
      </div>
    );
  }
  function ListView() {
    const rows = [...appointments].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return (
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>When</th><th>Patient</th>{showNurse && <th>Nurse</th>}<th>Location</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={showNurse ? 5 : 4} className="muted">No visits.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} onClick={() => onOpen(a)} style={{ cursor: "pointer" }}>
                <td><b>{new Date(a.scheduled_at).toLocaleDateString()}</b> <span className="muted">{timeLabel(a)}</span></td>
                <td>{a.patient_name}</td>
                {showNurse && <td>{a.nurse_id ? a.nurse_name : <span className="badge returned">unassigned</span>}</td>}
                <td className="muted">{a.location || a.visit_type}</td>
                <td><span className={`badge ${a.status === "completed" ? "approved" : a.status === "scheduled" ? "scheduled" : "submitted"}`}>{a.status.replace("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="cal-toolbar">
        {view !== "list" && (
          <div className="cal-nav">
            <button className="btn secondary" onClick={() => nav(-1)}>‹ Prev</button>
            <button className="btn secondary" onClick={() => setAnchor(TODAY)}>Today</button>
            <button className="btn secondary" onClick={() => nav(1)}>Next ›</button>
            <span className="cal-label">{label()}</span>
          </div>
        )}
        <div className="seg">
          {(["day", "week", "month", "list"] as View[]).map((x) => (
            <button key={x} className={view === x ? "on" : ""} onClick={() => setView(x)}>{x[0].toUpperCase() + x.slice(1)}</button>
          ))}
        </div>
      </div>
      {view === "week" && <WeekView />}
      {view === "day" && <DayView />}
      {view === "month" && <MonthView />}
      {view === "list" && <ListView />}
    </div>
  );
}
