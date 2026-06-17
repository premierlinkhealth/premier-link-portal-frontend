import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet, apiPut, apiPost, apiDownloadPdf } from "../api";
import { useAuth } from "../auth";
import { Assessment } from "../types";
import { HRA_SECTIONS, HraField } from "../hraFields";
import Scribe from "../components/Scribe";
import CodingPanel from "../components/CodingPanel";
import PhotoCapture, { VisitPhoto } from "../components/PhotoCapture";
import SignaturePad from "../components/SignaturePad";
import {
  ConfirmedCode,
  CodeSuggestion,
  HCC_V28,
  icdByCode,
  toConfirmed,
  rafTier,
  rafTagText,
  rafTotal,
  rafTotalMoney,
} from "../coding";

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
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="error">{err}</div>;
  if (!hra || !profile) return <div className="center-note">Loading…</div>;

  const isNurseOwner = profile.role === "nurse" && hra.nurse_id === profile.id;
  const editable = isNurseOwner && (hra.status === "draft" || hra.status === "returned");
  const isDoctorReview = profile.role === "doctor" && hra.status === "submitted";
  const isReviewer = profile.role !== "nurse"; // doctor/admin read-only summaries

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ---- Visit-documentation state, read from / written to form_data ----
  const transcript = (form.transcript as string) || "";
  const suggested = (form.suggested_codes as CodeSuggestion[]) || [];
  const confirmed = (form.confirmed_codes as ConfirmedCode[]) || [];
  const photos = (form.photos as VisitPhoto[]) || [];
  const signature = (form.nurse_signature as string) || "";

  // Credentialing gate (lightweight, prototype-style): the nurse must attest credentials
  // are current & on file before documenting a visit. Stored in form_data so no backend change.
  const credentialed = form.nurse_credentialed === true;

  function setConfirmed(next: ConfirmedCode[]) {
    set("confirmed_codes", next);
    set("raf_total", rafTotal(next));
  }
  function confirmCode(code: string) {
    const e = icdByCode(code);
    if (!e) return;
    if (confirmed.some((c) => c.code === e[0] || c.hcc === e[2])) return;
    setConfirmed([...confirmed, toConfirmed(e)]);
  }
  function applyVitals(patch: { bp?: string; pulse?: string; weight_lbs?: string; height_in?: string; meds?: string }) {
    setForm((f) => {
      const next = { ...f };
      if (patch.bp) next.bp = patch.bp;
      if (patch.pulse) next.pulse = patch.pulse;
      if (patch.weight_lbs) next.weight_lbs = patch.weight_lbs;
      if (patch.height_in) next.height_in = patch.height_in;
      if (patch.meds && !next.conditions_notes) next.conditions_notes = patch.meds;
      return next;
    });
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const saveDraft = () => run(() => apiPut(`/api/assessments/${hra!.id}`, { form_data: form }));
  const submit = () =>
    run(async () => {
      await apiPut(`/api/assessments/${hra!.id}`, { form_data: form });
      await apiPost(`/api/assessments/${hra!.id}/submit`);
    });
  const approve = () => run(() => apiPost(`/api/assessments/${hra!.id}/approve`));
  const doReturn = () => run(() => apiPost(`/api/assessments/${hra!.id}/return`, { notes }));

  async function downloadPdf() {
    const blob = await apiDownloadPdf(hra!.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HRA-${hra!.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ratTotal = rafTotal(confirmed);

  return (
    <div>
      <div className="spread">
        <h1 className="page">Health Risk Assessment</h1>
        <span className={`badge ${hra.status}`}>{hra.status}</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Patient: <strong>{hra.patient_name}</strong>
        {hra.nurse_name && profile.role !== "nurse" ? ` · Nurse: ${hra.nurse_name}` : ""}
      </p>

      <div className="banner">
        Provisional field set — pending healthcare-attorney review before go-live. Stored flexibly, so the approved fields drop in without a rebuild.
      </div>
      {err && <div className="error">{err}</div>}
      {hra.status === "returned" && hra.doctor_notes && (
        <div className="error">Returned by reviewer: {hra.doctor_notes}</div>
      )}

      {/* Credentialing gate — nurse must confirm credentials before documenting a visit. */}
      {editable && !credentialed && (
        <div className="card" style={{ marginBottom: 16, borderColor: "#f5d9a8" }}>
          <div className="banner" style={{ marginBottom: 12 }}>
            <strong>Credentialing check.</strong> Visit documentation is locked until you confirm your
            license, malpractice coverage, board certification, CPR/BLS, and background check are current and on file.
          </div>
          <button className="btn" onClick={() => set("nurse_credentialed", true)}>
            I confirm my credentials are current and on file
          </button>
        </div>
      )}

      {/* HRA sections (vitals, conditions, screens, plan). Locked until credentialed. */}
      {(!editable || credentialed) &&
        HRA_SECTIONS.map((section) => (
          <div className="card" key={section.title} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{section.title}</h3>
            {section.fields.map((f) => (
              <Field
                key={f.key}
                f={f}
                value={form[f.key]}
                disabled={!editable}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
        ))}

      {/* AI Visit Scribe + HCC coding — nurse-editable. */}
      {editable && credentialed && (
        <>
          <Scribe
            transcript={transcript}
            setTranscript={(t) => set("transcript", t)}
            suggestions={suggested}
            setSuggestions={(s) => set("suggested_codes", s)}
            confirmed={confirmed}
            onConfirm={(code) => {
              confirmCode(code);
              set("suggested_codes", suggested.filter((s) => s.code !== code));
            }}
            onVitals={applyVitals}
          />
          <CodingPanel confirmed={confirmed} onChange={setConfirmed} editable={true} />
          <PhotoCapture photos={photos} onChange={(p) => set("photos", p)} editable={true} />

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Attestation &amp; signature</h3>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontWeight: 400 }}>
              <input
                type="checkbox"
                style={{ width: "auto", marginTop: 3 }}
                checked={form.attest === true}
                onChange={(e) => set("attest", e.target.checked)}
              />
              <span>
                I, <strong>{profile.full_name}</strong>, attest that I personally conducted this assessment and that the
                information recorded is accurate to the best of my knowledge.
              </span>
            </label>
            <div style={{ marginTop: 14 }}>
              <label>
                Sign with your finger or stylus{" "}
                <span className="muted" style={{ fontWeight: 400 }}>
                  (optional — works on iPad/touchscreen; the checkbox above is the legal e-signature either way)
                </span>
              </label>
              <SignaturePad value={signature} onChange={(d) => set("nurse_signature", d)} editable={true} />
            </div>
          </div>
        </>
      )}

      {/* Read-only visit-documentation summaries for reviewers (doctor/admin). */}
      {isReviewer && (
        <>
          {confirmed.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Confirmed HCC codes (V28)</h3>
              {confirmed.map((c) => (
                <div className="hca" key={c.code}>
                  <span style={{ fontWeight: 600 }}>{c.label}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {c.code} · HCC {c.hcc}
                    {HCC_V28[String(c.hcc)] ? ` — ${HCC_V28[String(c.hcc)]}` : ""}
                  </span>
                  {rafTier(c.hcc) && <span className={`pill ${rafTier(c.hcc)}`}>{rafTagText(c.hcc)}</span>}
                </div>
              ))}
              <div className="raf-summary">
                <span>
                  <span className="muted" style={{ fontSize: 12 }}>RAF total</span>
                  <br />
                  <span className="big">{ratTotal.toFixed(3)}</span>
                </span>
                <span>
                  <span className="muted" style={{ fontSize: 12 }}>Est. annual value (demo)</span>
                  <br />
                  <span className="money">{rafTotalMoney(ratTotal)}</span>
                </span>
              </div>
            </div>
          )}

          {transcript && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Visit transcript (internal record)</h3>
              <p className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{transcript}</p>
            </div>
          )}

          {photos.length > 0 && (
            <PhotoCapture photos={photos} onChange={() => {}} editable={false} />
          )}

          {signature && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Nurse signature</h3>
              <SignaturePad value={signature} onChange={() => {}} editable={false} />
            </div>
          )}
        </>
      )}

      <div className="card">
        {editable && credentialed && (
          <div className="row">
            <button className="btn secondary" onClick={saveDraft} disabled={busy}>
              Save draft
            </button>
            <button className="btn" onClick={submit} disabled={busy}>
              Submit for review
            </button>
          </div>
        )}
        {isDoctorReview && (
          <div>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn" onClick={approve} disabled={busy}>
                Approve &amp; sign
              </button>
            </div>
            <label>Return with notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What needs fixing…" />
            <div style={{ marginTop: 8 }}>
              <button className="btn danger" onClick={doReturn} disabled={busy || !notes.trim()}>
                Return to nurse
              </button>
            </div>
          </div>
        )}
        {hra.status === "approved" && (
          <div className="row">
            <span className="muted">
              Signed{hra.doctor_name ? ` by ${hra.doctor_name}` : ""}
              {hra.signed_at ? ` · ${new Date(hra.signed_at).toLocaleString()}` : ""}.
            </span>
            <button className="btn" onClick={() => downloadPdf().catch((e) => setErr(e.message))}>
              Download PDF
            </button>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost" onClick={() => nav(-1)}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  f,
  value,
  disabled,
  onChange,
}: {
  f: HraField;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const v = value;
  if (f.type === "textarea")
    return (
      <div className="field">
        <label>{f.label}</label>
        <textarea rows={3} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  if (f.type === "select")
    return (
      <div className="field">
        <label>{f.label}</label>
        <select disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  if (f.type === "checkboxes") {
    const arr = Array.isArray(v) ? (v as string[]) : [];
    return (
      <div className="field">
        <label>{f.label}</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
          {f.options.map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, width: "auto" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                disabled={disabled}
                checked={arr.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <label>{f.label}</label>
      <input type={f.type} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
