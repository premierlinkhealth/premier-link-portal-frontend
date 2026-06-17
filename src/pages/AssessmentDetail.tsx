import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet, apiPut, apiPost, apiDownloadPdf } from "../api";
import { useAuth } from "../auth";
import { Assessment } from "../types";
import { HRA_SECTIONS, HraField } from "../hraFields";

export default function AssessmentDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const nav = useNavigate();
  const [hra, setHra] = useState<Assessment | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  async function load() {
    const r = await apiGet(`/api/assessments/${id}`);
    setHra(r.assessment);
    setForm(r.assessment.form_data || {});
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [id]);

  if (err) return <div className="error">{err}</div>;
  if (!hra || !profile) return <div className="center-note">Loading…</div>;

  const isNurseOwner = profile.role === "nurse" && hra.nurse_id === profile.id;
  const editable = isNurseOwner && (hra.status === "draft" || hra.status === "returned");
  const isDoctorReview = profile.role === "doctor" && hra.status === "submitted";

  function set(key: string, value: unknown) { setForm((f) => ({ ...f, [key]: value })); }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  const saveDraft = () => run(() => apiPut(`/api/assessments/${hra!.id}`, { form_data: form }));
  const submit = () => run(async () => { await apiPut(`/api/assessments/${hra!.id}`, { form_data: form }); await apiPost(`/api/assessments/${hra!.id}/submit`); });
  const approve = () => run(() => apiPost(`/api/assessments/${hra!.id}/approve`));
  const doReturn = () => run(() => apiPost(`/api/assessments/${hra!.id}/return`, { notes }));

  async function downloadPdf() {
    const blob = await apiDownloadPdf(hra!.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `HRA-${hra!.id}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="spread">
        <h1 className="page">Health Risk Assessment</h1>
        <span className={`badge ${hra.status}`}>{hra.status}</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Patient: <strong>{hra.patient_name}</strong>{hra.nurse_name && profile.role !== "nurse" ? ` · Nurse: ${hra.nurse_name}` : ""}
      </p>

      <div className="banner">
        Provisional field set — pending healthcare-attorney review before go-live. Stored flexibly, so the approved fields drop in without a rebuild.
      </div>
      {err && <div className="error">{err}</div>}
      {hra.status === "returned" && hra.doctor_notes && (
        <div className="error">Returned by reviewer: {hra.doctor_notes}</div>
      )}

      {HRA_SECTIONS.map((section) => (
        <div className="card" key={section.title} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{section.title}</h3>
          {section.fields.map((f) => (
            <Field key={f.key} f={f} value={form[f.key]} disabled={!editable} onChange={(v) => set(f.key, v)} />
          ))}
        </div>
      ))}

      <div className="card">
        {editable && (
          <div className="row">
            <button className="btn secondary" onClick={saveDraft} disabled={busy}>Save draft</button>
            <button className="btn" onClick={submit} disabled={busy}>Submit for review</button>
          </div>
        )}
        {isDoctorReview && (
          <div>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn" onClick={approve} disabled={busy}>Approve &amp; sign</button>
            </div>
            <label>Return with notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What needs fixing…" />
            <div style={{ marginTop: 8 }}>
              <button className="btn danger" onClick={doReturn} disabled={busy || !notes.trim()}>Return to nurse</button>
            </div>
          </div>
        )}
        {hra.status === "approved" && (
          <div className="row">
            <span className="muted">Signed{hra.doctor_name ? ` by ${hra.doctor_name}` : ""}{hra.signed_at ? ` · ${new Date(hra.signed_at).toLocaleString()}` : ""}.</span>
            <button className="btn" onClick={() => downloadPdf().catch((e) => setErr(e.message))}>Download PDF</button>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={() => nav(-1)}>← Back</button>
        </div>
      </div>
    </div>
  );
}

function Field({ f, value, disabled, onChange }: { f: HraField; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const v = value;
  if (f.type === "textarea")
    return <div className="field"><label>{f.label}</label><textarea rows={3} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} /></div>;
  if (f.type === "select")
    return (
      <div className="field"><label>{f.label}</label>
        <select disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  if (f.type === "checkboxes") {
    const arr = Array.isArray(v) ? (v as string[]) : [];
    return (
      <div className="field"><label>{f.label}</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
          {f.options.map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, width: "auto" }}>
              <input type="checkbox" style={{ width: "auto" }} disabled={disabled} checked={arr.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return <div className="field"><label>{f.label}</label><input type={f.type} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} /></div>;
}
