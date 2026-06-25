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
import DeltaCard from "../components/DeltaCard";
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

// Steps for the guided nurse visit flow (Phase 1 of the HRA redesign).
const STEP_TITLES = ["Vitals", "Dictate", "Conditions", "Function", "Plan", "Photos", "Review"];

export default function AssessmentDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const nav = useNavigate();
  const [hra, setHra] = useState<Assessment | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState(0);

  async function load() {
    const r = await apiGet(`/api/assessments/${id}`);
    setHra(r.assessment);
    setForm(r.assessment.form_data || {});
  }
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [id]);

  // Default the visit date to today for a nurse opening an editable visit (fixes the
  // old form where it could be submitted blank). No-op once a date exists.
  useEffect(() => {
    if (!hra || !profile) return;
    const ed =
      profile.role === "nurse" &&
      hra.nurse_id === profile.id &&
      (hra.status === "draft" || hra.status === "returned");
    if (!ed) return;
    setForm((f) => (f.visit_date ? f : { ...f, visit_date: new Date().toISOString().slice(0, 10) }));
  }, [hra, profile]);

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
  const quietSave = () =>
    apiPut(`/api/assessments/${hra!.id}`, { form_data: form }).catch(() => {});
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

  // ---- Guided wizard helpers (nurse editable flow) ----
  const sectionByTitle = (t: string) => HRA_SECTIONS.find((s) => s.title === t);
  const visitSec = sectionByTitle("Visit");
  const condSec = sectionByTitle("Chronic conditions (confirm / update)");
  const funcSec = sectionByTitle("Functional & risk screen");
  const planSec = sectionByTitle("Plan");
  const total = STEP_TITLES.length;
  const goNext = () => {
    quietSave();
    setStep((s) => Math.min(total - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const condsArr = Array.isArray(form.conditions) ? (form.conditions as string[]) : [];
  const reviewGaps: string[] = [];
  if (!form.visit_date) reviewGaps.push("Visit date not set");
  if (confirmed.length === 0 && condsArr.length === 0)
    reviewGaps.push("No conditions or HCC codes documented");
  if (!form.fall_risk || !form.cognition || !form.adl_independent)
    reviewGaps.push("Functional screen incomplete");

  const renderFields = (fields: HraField[]) =>
    fields.map((f) => {
      const fld = f.key === "visit_type" ? ({ ...f, label: "Visit setting" } as HraField) : f;
      return (
        <Field key={f.key} f={fld} value={form[f.key]} disabled={!editable} onChange={(v) => set(f.key, v)} />
      );
    });

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

      {/* ===== Guided card flow (nurse editable) ===== */}
      {editable && credentialed && (
        <div>
          {/* progress header */}
          <div className="card" style={{ marginBottom: 16, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 15 }}>
                Step {step + 1} of {total} · {STEP_TITLES[step]}
              </strong>
              {reviewGaps.length > 0 ? (
                <span
                  onClick={() => setStep(total - 1)}
                  style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#c2410c", background: "#fff4ed", borderRadius: 99, padding: "4px 10px" }}
                >
                  ⚑ {reviewGaps.length} to check
                </span>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d", background: "#eafaf1", borderRadius: 99, padding: "4px 10px" }}>
                  ✓ on track
                </span>
              )}
            </div>
            <div style={{ height: 8, background: "#e9eef4", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${((step + 1) / total) * 100}%`, background: "#12a594", transition: "width .3s" }} />
            </div>
          </div>

          {/* step body */}
          {step === 0 && visitSec && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Vitals</h3>
              <p className="muted" style={{ marginTop: -6 }}>Visit setting is pre-filled from the appointment; date defaults to today.</p>
              {renderFields(visitSec.fields)}
            </div>
          )}

          {step === 1 && (
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
          )}

          {step === 2 && condSec && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Chronic conditions</h3>
                {renderFields(condSec.fields)}
              </div>
              <CodingPanel confirmed={confirmed} onChange={setConfirmed} editable={true} />
            </>
          )}

          {step === 3 && funcSec && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Functional &amp; risk screen</h3>
              {renderFields(funcSec.fields)}
            </div>
          )}

          {step === 4 && planSec && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Plan</h3>
              {renderFields(planSec.fields)}
            </div>
          )}

          {step === 5 && (
            <PhotoCapture photos={photos} onChange={(p) => set("photos", p)} editable={true} />
          )}

          {step === 6 && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>Review &amp; sign</h3>
                {reviewGaps.length > 0 ? (
                  <div className="banner" style={{ background: "#fff4ed", borderColor: "#f2c9bb" }}>
                    <strong>⚑ {reviewGaps.length} thing{reviewGaps.length > 1 ? "s" : ""} to check before you finish</strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {reviewGaps.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="banner" style={{ background: "#eafaf1", borderColor: "#bfe6d4" }}>
                    <strong>✓ Nothing flagged — every section is documented.</strong>
                  </div>
                )}

                {confirmed.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    {confirmed.map((c) => (
                      <div className="hca" key={c.code}>
                        <span style={{ fontWeight: 600 }}>{c.label}</span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {c.code} · HCC {c.hcc}
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

                <div style={{ marginTop: 16 }}>
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
                        (optional — the checkbox above is the legal e-signature either way)
                      </span>
                    </label>
                    <SignaturePad value={signature} onChange={(d) => set("nurse_signature", d)} editable={true} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* wizard nav */}
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn ghost" onClick={goPrev} disabled={step === 0}>
                ← Previous
              </button>
              {step < total - 1 ? (
                <button className="btn" onClick={goNext}>
                  Next →
                </button>
              ) : (
                <div className="row">
                  <button className="btn secondary" onClick={saveDraft} disabled={busy}>
                    Save draft
                  </button>
                  <button className="btn" onClick={submit} disabled={busy}>
                    Submit for review
                  </button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => nav(-1)}>
                ← Back to list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HRA sections read-only (nurse viewing a submitted/approved chart, or reviewer context). */}
      {!editable &&
        HRA_SECTIONS.map((section) => (
          <div className="card" key={section.title} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{section.title}</h3>
            {section.fields.map((f) => (
              <Field key={f.key} f={f} value={form[f.key]} disabled={true} onChange={() => {}} />
            ))}
          </div>
        ))}

      {/* Read-only visit-documentation summaries for reviewers (doctor/admin). */}
      {isReviewer && (
        <>
          <DeltaCard hccHistory={form.hcc_history} confirmed={confirmed} />

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

          {photos.length > 0 && <PhotoCapture photos={photos} onChange={() => {}} editable={false} />}

          {signature && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Nurse signature</h3>
              <SignaturePad value={signature} onChange={() => {}} editable={false} />
            </div>
          )}
        </>
      )}

      {/* Reviewer actions + approved/PDF + back (nurse wizard has its own nav above). */}
      {!(editable && credentialed) && (
        <div className="card">
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
      )}
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
