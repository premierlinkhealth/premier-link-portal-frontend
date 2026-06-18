import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api";
import { Appointment, Patient, AppUser } from "../../types";
import { rankNurses, NurseMatch } from "../../nurseMatch";
import { weekdayOf } from "../../geo";

const VISIT_TYPES = ["AWV", "Telehealth"];

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
      setNurses((u.users as AppUser[]).filter((x) => x.role === "nurse" && x.status === "active"));
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  const patient = patients.find((p) => p.id === form.patient_id) || null;

  // Live nurse ranking once we know the patient, time, and visit type.
  const ranked: NurseMatch[] = useMemo(() => {
    if (!patient || !form.scheduled_at) return [];
    const iso = new Date(form.scheduled_at).toISOString();
    return rankNurses(nurses, {
      patientCity: patient.address_city,
      visitType: form.visit_type,
      scheduledAt: iso,
      existingAppts: appts,
    });
  }, [patient, form.scheduled_at, form.visit_type, nurses, appts]);

  const day = form.scheduled_at ? weekdayOf(new Date(form.scheduled_at).toISOString()) : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await apiPost("/api/appointments", {
        patient_id: form.patient_id,
        nurse_id: form.nurse_id || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        location: form.location || (patient ? [patient.address_street, patient.address_city].filter(Boolean).join(", ") : null) || null,
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
      <p className="muted" style={{ marginTop: 0 }}>Create a visit — we rank nurses by availability, coverage, distance, visit type, and credentials.</p>
      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Create a visit</h3>
        <form onSubmit={create}>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Patient</label>
              <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value, nurse_id: "" })} required>
                <option value="">Select…</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.address_city ? ` · ${p.address_city}` : ""}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}><label>Visit type</label>
              <select value={form.visit_type} onChange={(e) => setForm({ ...form, visit_type: e.target.value, nurse_id: "" })}>
                {VISIT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Date &amp; time</label><input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value, nurse_id: "" })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={patient?.address_city ? `${patient.address_city} (auto)` : "Address or 'Telehealth'"} /></div>
          </div>

          {/* Smart nurse suggestions */}
          <div className="field">
            <label>
              Assign nurse{" "}
              {patient && form.scheduled_at && (
                <span className="muted" style={{ fontWeight: 400 }}>
                  · ranked for {patient.address_city || "unknown city"}{day ? `, ${day}` : ""}, {form.visit_type}
                </span>
              )}
            </label>
            {!(patient && form.scheduled_at) && (
              <p className="muted" style={{ fontSize: 13 }}>Pick a patient and time to see ranked nurse suggestions.</p>
            )}
            {patient && form.scheduled_at && ranked.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No active nurses to rank.</p>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {ranked.map((m) => {
                const selected = form.nurse_id === m.nurse.id;
                return (
                  <button
                    type="button"
                    key={m.nurse.id}
                    onClick={() => setForm({ ...form, nurse_id: selected ? "" : m.nurse.id })}
                    className="card"
                    style={{
                      textAlign: "left", cursor: "pointer", padding: "10px 12px", margin: 0,
                      borderColor: selected ? "var(--teal)" : m.conflict ? "#f1c9c6" : "var(--line)",
                      borderWidth: selected ? 2 : 1, opacity: m.qualified ? 1 : 0.75,
                    }}
                  >
                    <div className="spread" style={{ alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b>{m.nurse.full_name}</b>
                        {m.qualified ? <span className="pill good">best match</span> : <span className="pill warn">check</span>}
                        {m.coversCity && <span className="pill blue">covers area</span>}
                        {m.credStatus === "expiring" && <span className="pill warn">cred expiring</span>}
                        {m.credStatus === "expired" && <span className="pill bad">cred expired</span>}
                        {m.conflict && <span className="pill bad">time conflict</span>}
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {m.distanceMiles != null ? `${m.distanceMiles} mi` : "distance n/a"}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{m.reasons.join(" · ")}</div>
                  </button>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Or leave unassigned. {form.nurse_id ? "" : "No nurse selected — visit will be created unassigned."}
            </p>
          </div>

          <button className="btn" disabled={busy || !form.patient_id || !form.scheduled_at}>Create visit</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Patient</th><th>Nurse</th><th>When</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {appts.length === 0 && <tr><td colSpan={5} className="muted">No visits yet.</td></tr>}
            {appts.map((a) => (
              <tr key={a.id}>
                <td>{a.patient_name}</td>
                <td>{a.nurse_name || <span className="pill bad">unassigned</span>}</td>
                <td>{new Date(a.scheduled_at).toLocaleString()}</td>
                <td>{a.visit_type}</td>
                <td><span className={`badge ${a.status}`}>{a.status.replace("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
