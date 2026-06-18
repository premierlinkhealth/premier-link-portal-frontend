// Admin Settings: visit types, IPA contracted rates, nurse pay, credential
// checklist, and a next-day notification preview. Drives revenue + nurse pay
// across the app.

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../../api";
import { AppSettings, DEFAULT_SETTINGS, money } from "../../settings";
import { Patient } from "../../types";

export default function Settings() {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [groups, setGroups] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newType, setNewType] = useState("");

  async function load() {
    try {
      const [r, p] = await Promise.all([apiGet("/api/settings"), apiGet("/api/patients")]);
      setS({ ...DEFAULT_SETTINGS, ...r.settings });
      setGroups(Array.from(new Set((p.patients as Patient[]).map((x) => x.medical_group).filter(Boolean))) as string[]);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  function setRate(vt: string, v: string) { setS({ ...s, rates: { ...s.rates, [vt]: Number(v) || 0 } }); }
  function setPay(vt: string, v: string) { setS({ ...s, nurse_pay: { ...s.nurse_pay, [vt]: Number(v) || 0 } }); }
  function setIpaRate(g: string, vt: string, v: string) {
    const grp = { ...(s.ipa_rates[g] || {}) };
    if (v.trim() === "") delete grp[vt]; else grp[vt] = Number(v) || 0;
    setS({ ...s, ipa_rates: { ...s.ipa_rates, [g]: grp } });
  }
  function addType() {
    const t = newType.trim();
    if (!t || s.visit_types.includes(t)) return;
    setS({ ...s, visit_types: [...s.visit_types, t], rates: { ...s.rates, [t]: 0 }, nurse_pay: { ...s.nurse_pay, [t]: 0 } });
    setNewType("");
  }
  function removeType(t: string) {
    setS({ ...s, visit_types: s.visit_types.filter((x) => x !== t) });
  }
  function setCreds(text: string) {
    setS({ ...s, credential_items: text.split("\n").map((x) => x.trim()).filter(Boolean) });
  }

  async function save() {
    setBusy(true); setErr(null); setMsg(null);
    try { await apiPut("/api/settings", { settings: s }); setMsg("Settings saved."); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page">Settings</h1>
      <p className="muted" style={{ marginTop: 0 }}>Visit types, contracted rates, nurse pay, and credential requirements.</p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="notice">{msg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Visit types</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {s.visit_types.map((t) => (
            <span key={t} className="pill blue" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {t}
              <button type="button" className="btn ghost" style={{ padding: "0 4px" }} onClick={() => removeType(t)}>✕</button>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New visit type (e.g. In-home)" style={{ maxWidth: 260 }} />
          <button type="button" className="btn secondary" onClick={addType}>Add</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Default contracted rates (what Premier Link bills)</h3>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {s.visit_types.map((t) => (
            <div className="field" key={t} style={{ width: 160 }}>
              <label>{t}</label>
              <input type="number" value={s.rates[t] ?? 0} onChange={(e) => setRate(t, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Per-IPA rate overrides</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Leave blank to use the default rate above.</p>
          <table>
            <thead><tr><th>Medical group</th>{s.visit_types.map((t) => <th key={t}>{t}</th>)}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g}>
                  <td><b>{g}</b></td>
                  {s.visit_types.map((t) => (
                    <td key={t}>
                      <input type="number" style={{ width: 90 }} value={s.ipa_rates[g]?.[t] ?? ""} placeholder={String(s.rates[t] ?? 0)} onChange={(e) => setIpaRate(g, t, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nurse pay (what nurses earn / see)</h3>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {s.visit_types.map((t) => (
            <div className="field" key={t} style={{ width: 160 }}>
              <label>{t}</label>
              <input type="number" value={s.nurse_pay[t] ?? 0} onChange={(e) => setPay(t, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Credential checklist (required of every nurse)</h3>
        <textarea rows={5} value={s.credential_items.join("\n")} onChange={(e) => setCreds(e.target.value)} placeholder="One credential per line" />
      </div>

      <NotificationPreview rates={s} />

      <div className="row">
        <button className="btn" disabled={busy} onClick={save}>Save settings</button>
      </div>
    </div>
  );
}

function NotificationPreview({ rates }: { rates: AppSettings }) {
  const [appts, setAppts] = useState<{ patient_name?: string; nurse_name?: string; scheduled_at: string; visit_type: string }[]>([]);
  useEffect(() => { apiGet("/api/appointments").then((r) => setAppts(r.appointments || [])).catch(() => {}); }, []);

  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const next = appts.filter((a) => a.scheduled_at.slice(0, 10) === tomorrow);
  const sample = next[0];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Notification preview</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>What nurses would receive the evening before. (Preview only — sending isn't wired yet.)</p>
      <div className="note" style={{ marginBottom: 10 }}>
        <b>Email — Tomorrow's schedule</b><br />
        {sample
          ? `Hi ${sample.nurse_name || "there"}, you have ${next.length} visit${next.length > 1 ? "s" : ""} tomorrow. First up: ${sample.patient_name} (${sample.visit_type}) at ${new Date(sample.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Pay: ${money(rates.nurse_pay[sample.visit_type] ?? 0)}.`
          : "No visits scheduled for tomorrow."}
      </div>
      <div className="note">
        <b>SMS reminder</b><br />
        {sample
          ? `Premier Link: ${next.length} visit${next.length > 1 ? "s" : ""} tomorrow, first at ${new Date(sample.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Reply STOP to opt out.`
          : "No visits scheduled for tomorrow."}
      </div>
    </div>
  );
}
