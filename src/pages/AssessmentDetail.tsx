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
import { normalizePriors, PriorCond } from "../delta";
import {
  ConfirmedCode,
  CodeSuggestion,
  IcdEntry,
  HCC_V28,
  icdByCode,
  icdSearch,
  toConfirmed,
  rafTier,
  rafTagText,
  rafTotal,
  rafTotalMoney,
} from "../coding";

const STEP_TITLES = ["Vitals", "Dictate", "Conditions", "Function", "Plan", "Photos", "Review"];
const MEAT = ["Monitor", "Evaluate", "Assess", "Treat"];
const priorKey = (p: PriorCond) => (p.hcc != null ? `h${p.hcc}` : `l${p.label.toLowerCase()}`);

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

  // Default visit date to today for an editable nurse visit (fixes blank-date submits).
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
  const isReviewer = profile.role !== "nurse";

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const transcript = (form.transcript as string) || "";
  const suggested = (form.suggested_codes as CodeSuggestion[]) || [];
  const confirmed = (form.confirmed_codes as ConfirmedCode[]) || [];
  const photos = (form.photos as VisitPhoto[]) || [];
  const signature = (form.nurse_signature as string) || "";
  const credentialed = form.nurse_credentialed === true;
  const recapture = (form.recapture as Record<string, string>) || {};
  const meat = (form.meat as Record<string, { tags: string[]; quote: string }>) || {};
  const priors: PriorCond[] = normalizePriors(form.hcc_history);

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

  // --- recapture actions: write status + keep confirmed_codes / meat in sync ---
  const matchesPrior = (c: ConfirmedCode, p: PriorCond) =>
    p.hcc != null ? c.hcc === p.hcc : c.label.toLowerCase() === p.label.toLowerCase();

  function recap(p: PriorCond, status: "confirm" | "update" | "resolve") {
    const key = priorKey(p);
    set("recapture", { ...recapture, [key]: status });
    if (status === "confirm") {
      if (!confirmed.some((c) => matchesPrior(c, p))) {
        const code = p.hcc != null ? `HCC ${p.hcc}` : p.label;
        setConfirmed([...confirmed, { code, label: p.label, hcc: p.hcc ?? 0, raf: p.raf }]);
      }
    } else if (status === "resolve") {
      setConfirmed(confirmed.filter((c) => !matchesPrior(c, p)));
      const m = { ...meat };
      delete m[key];
      set("meat", m);
    }
  }
  function updatePriorTo(p: PriorCond, e: IcdEntry) {
    const key = priorKey(p);
    const next = confirmed.filter((c) => !matchesPrior(c, p));
    const cc = toConfirmed(e);
    if (!next.some((c) => c.code === cc.code || c.hcc === cc.hcc)) next.push(cc);
    setConfirmed(next);
    set("recapture", { ...recapture, [key]: "update" });
  }
  function setMeat(p: PriorCond, patch: Partial<{ tags: string[]; quote: string }>) {
    const key = priorKey(p);
    const cur = meat[key] || { tags: [], quote: "" };
    set("meat", { ...meat, [key]: { ...cur, ...patch } });
  }
  function toggleMeatTag(p: PriorCond, tag: string) {
    const key = priorKey(p);
    const cur = meat[key]?.tags || [];
    setMeat(p, { tags: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] });
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
  const quietSave = () => apiPut(`/api/assessments/${hra!.id}`, { form_data: form }).catch(() => {});
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
  const sectionByTitle = (t: string) => HRA_SECTIONS.find((s) => s.title === t);
  const total = STEP_TITLES.length;
  const goNext = () => {
    quietSave();
    setStep((s) => Math.min(total - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const addressedPriors = priors.filter((p) => recapture[priorKey(p)]);
  const condsArr = Array.isArray(form.conditions) ? (form.conditions as string[]) : [];
  const gaps: { t: string; step: number }[] = [];
  priors.forEach((p) => {
    if (!recapture[priorKey(p)]) gaps.push({ t: `"${p.label}" not addressed`, step: 2 });
  });
  if (!form.visit_date) gaps.push({ t: "Visit date not set", step: 0 });
  if (confirmed.length === 0 && condsArr.length === 0) gaps.push({ t: "No conditions documented", step: 2 });
  if (!form.fall_risk || !form.cognition || !form.adl_independent) gaps.push({ t: "Functional screen incomplete", step: 3 });

  const renderFields = (fields: HraField[]) =>
    fields.map((f) => {
      const fld = f.key === "visit_type" ? ({ ...f, label: "Visit setting" } as HraField) : f;
      return <Field key={f.key} f={fld} value={form[f.key]} disabled={!editable} onChange={(v) => set(f.key, v)} />;
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

      {/* ===================== Guided card flow (nurse) ===================== */}
      {editable && credentialed && (
        <div className="hraflow">
          <FlowStyles />
          <div className="hf-top">
            <div className="hf-steplabel">
              Step {step + 1} of {total} · <b>{STEP_TITLES[step]}</b>
            </div>
            {gaps.length > 0 ? (
              <button className="hf-gap" onClick={() => setStep(total - 1)}>⚑ {gaps.length} to check</button>
            ) : (
              <span className="hf-gap clear">✓ on track</span>
            )}
            <div className="hf-bar"><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
          </div>

          <div className="hf-wrap">
            <div className="hf-main">
              {step === 0 && (
                <div className="hf-card">
                  <h3>Vitals</h3>
                  <p className="muted hf-sub">Visit setting is pre-filled from the appointment; date defaults to today.</p>
                  {renderFields(sectionByTitle("Visit")?.fields ?? [])}
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

              {step === 2 && (
                <>
                  <div className="hf-card">
                    <h3>Last year's conditions — address each</h3>
                    <p className="muted hf-sub">Re-document what was on file. Nothing carries forward unless you confirm it today.</p>
                    {priors.length === 0 && (
                      <div className="hf-empty">No prior conditions on file for this patient yet. Document anything found today below.</div>
                    )}
                    {priors.map((p) => {
                      const key = priorKey(p);
                      const st = recapture[key];
                      const mk = meat[key] || { tags: [], quote: "" };
                      return (
                        <div className="hf-cond" key={key}>
                          <div className="hf-cond-head">
                            <div>
                              <div className="hf-cond-name">{p.label}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {p.hcc != null ? `HCC ${p.hcc}` : "—"}
                                {rafTier(p.hcc ?? -1) && <span className={`pill ${rafTier(p.hcc ?? -1)}`} style={{ marginLeft: 8 }}>{rafTagText(p.hcc ?? -1)}</span>}
                              </div>
                            </div>
                            <div className="hf-tri">
                              <button className={`hf-t c ${st === "confirm" ? "on" : ""}`} onClick={() => recap(p, "confirm")}>✓ Confirm</button>
                              <button className={`hf-t u ${st === "update" ? "on" : ""}`} onClick={() => recap(p, "update")}>✎ Update</button>
                              <button className={`hf-t r ${st === "resolve" ? "on" : ""}`} onClick={() => recap(p, "resolve")}>✕ Resolved</button>
                            </div>
                          </div>
                          {st === "update" && (
                            <div className="hf-meat">
                              <label className="hf-lbl">Pick the specific code documented today</label>
                              <CodeSearch onPick={(e) => updatePriorTo(p, e)} />
                            </div>
                          )}
                          {(st === "confirm" || st === "update") && (
                            <div className="hf-meat">
                              <label className="hf-lbl">Evidence (MEAT)</label>
                              <div className="hf-chips">
                                {MEAT.map((m) => (
                                  <button key={m} className={`hf-chip ${mk.tags.includes(m) ? "on" : ""}`} onClick={() => toggleMeatTag(p, m)}>{m}</button>
                                ))}
                              </div>
                              <textarea className="hf-quote" placeholder="Supporting note…" value={mk.quote}
                                onChange={(e) => setMeat(p, { quote: e.target.value })} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <CodingPanel confirmed={confirmed} onChange={setConfirmed} editable={true} />
                </>
              )}

              {step === 3 && (
                <div className="hf-card">
                  <h3>Functional &amp; risk screen</h3>
                  {renderFields(sectionByTitle("Functional & risk screen")?.fields ?? [])}
                </div>
              )}

              {step === 4 && (
                <div className="hf-card">
                  <h3>Plan</h3>
                  {renderFields(sectionByTitle("Plan")?.fields ?? [])}
                </div>
              )}

              {step === 5 && <PhotoCapture photos={photos} onChange={(p) => set("photos", p)} editable={true} />}

              {step === 6 && (
                <div className="hf-card">
                  <h3>Review &amp; sign</h3>
                  {gaps.length > 0 ? (
                    <div className="hf-gapbox">
                      <strong>⚑ {gaps.length} thing{gaps.length > 1 ? "s" : ""} to check before you finish</strong>
                      {gaps.map((g, i) => (
                        <div key={i} className="hf-gapitem" onClick={() => setStep(g.step)}>• {g.t} →</div>
                      ))}
                    </div>
                  ) : (
                    <div className="hf-okbox"><strong>✓ Nothing flagged — every prior condition addressed.</strong></div>
                  )}
                  {confirmed.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      {confirmed.map((c) => (
                        <div className="hca" key={c.code + c.label}>
                          <span style={{ fontWeight: 600 }}>{c.label}</span>
                          <span className="muted" style={{ fontSize: 12 }}>{c.code} · HCC {c.hcc}</span>
                          {rafTier(c.hcc) && <span className={`pill ${rafTier(c.hcc)}`}>{rafTagText(c.hcc)}</span>}
                        </div>
                      ))}
                      <div className="raf-summary">
                        <span><span className="muted" style={{ fontSize: 12 }}>RAF total</span><br /><span className="big">{ratTotal.toFixed(3)}</span></span>
                        <span><span className="muted" style={{ fontSize: 12 }}>Est. annual value (demo)</span><br /><span className="money">{rafTotalMoney(ratTotal)}</span></span>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontWeight: 400 }}>
                      <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={form.attest === true}
                        onChange={(e) => set("attest", e.target.checked)} />
                      <span>I, <strong>{profile.full_name}</strong>, attest that I personally conducted this assessment and that the information recorded is accurate to the best of my knowledge.</span>
                    </label>
                    <div style={{ marginTop: 14 }}>
                      <label>Sign with your finger or stylus <span className="muted" style={{ fontWeight: 400 }}>(optional — the checkbox above is the legal e-signature either way)</span></label>
                      <SignaturePad value={signature} onChange={(d) => set("nurse_signature", d)} editable={true} />
                    </div>
                  </div>
                </div>
              )}

              {/* nav */}
              <div className="hf-nav">
                <button className="btn ghost" onClick={goPrev} disabled={step === 0}>← Previous</button>
                {step < total - 1 ? (
                  <button className="btn hf-next" onClick={goNext}>Next →</button>
                ) : (
                  <div className="row">
                    <button className="btn secondary" onClick={saveDraft} disabled={busy}>Save draft</button>
                    <button className="btn hf-next" onClick={submit} disabled={busy}>Submit for review</button>
                  </div>
                )}
              </div>
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => nav(-1)}>← Back to list</button>
            </div>

            {/* capture rail */}
            <div className="hf-rail">
              <div className="hf-meter">
                <div className="hf-raf">{ratTotal.toFixed(2)}</div>
                <div className="hf-money">≈{rafTotalMoney(ratTotal)}/yr captured</div>
              </div>
              <div className="hf-stat"><b>{confirmed.length}</b> conditions coded</div>
              {priors.length > 0 && (
                <div className="hf-stat"><b>{addressedPriors.length}/{priors.length}</b> prior conditions addressed</div>
              )}
              <div className={`hf-stat ${gaps.length ? "warn" : "ok"}`}>
                {gaps.length ? `⚑ ${gaps.length} to check` : "✓ nothing flagged"}
              </div>
              {priors.length > 0 && (
                <div className="hf-priorlist">
                  {priors.map((p) => {
                    const st = recapture[priorKey(p)];
                    return (
                      <div className="hf-prow" key={priorKey(p)}>
                        <span className={`hf-dot ${st || "none"}`} />{p.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HRA sections read-only (nurse viewing submitted/approved, or reviewer). */}
      {!editable &&
        HRA_SECTIONS.map((section) => (
          <div className="card" key={section.title} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{section.title}</h3>
            {section.fields.map((f) => (
              <Field key={f.key} f={f} value={form[f.key]} disabled={true} onChange={() => {}} />
            ))}
          </div>
        ))}

      {/* Reviewer summaries (doctor/admin). */}
      {isReviewer && (
        <>
          <DeltaCard hccHistory={form.hcc_history} confirmed={confirmed} />
          {confirmed.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Confirmed HCC codes (V28)</h3>
              {confirmed.map((c) => (
                <div className="hca" key={c.code + c.label}>
                  <span style={{ fontWeight: 600 }}>{c.label}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {c.code} · HCC {c.hcc}
                    {HCC_V28[String(c.hcc)] ? ` — ${HCC_V28[String(c.hcc)]}` : ""}
                  </span>
                  {rafTier(c.hcc) && <span className={`pill ${rafTier(c.hcc)}`}>{rafTagText(c.hcc)}</span>}
                </div>
              ))}
              <div className="raf-summary">
                <span><span className="muted" style={{ fontSize: 12 }}>RAF total</span><br /><span className="big">{ratTotal.toFixed(3)}</span></span>
                <span><span className="muted" style={{ fontSize: 12 }}>Est. annual value (demo)</span><br /><span className="money">{rafTotalMoney(ratTotal)}</span></span>
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

      {/* Reviewer actions + approved/PDF + back (nurse flow has its own nav). */}
      {!(editable && credentialed) && (
        <div className="card">
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
              <span className="muted">
                Signed{hra.doctor_name ? ` by ${hra.doctor_name}` : ""}
                {hra.signed_at ? ` · ${new Date(hra.signed_at).toLocaleString()}` : ""}.
              </span>
              <button className="btn" onClick={() => downloadPdf().catch((e) => setErr(e.message))}>Download PDF</button>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => nav(-1)}>← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- inline ICD-10 / V28 search (used by recapture "Update") ----
function CodeSearch({ onPick }: { onPick: (e: IcdEntry) => void }) {
  const [q, setQ] = useState("");
  const results = q.trim().length >= 2 ? icdSearch(q) : [];
  return (
    <div className="hf-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a code or condition — e.g. E11.22 or chronic kidney" />
      {results.length > 0 && (
        <div className="hf-results">
          {results.map((e) => (
            <div key={e[0]} className="hf-result" onClick={() => { onPick(e); setQ(""); }}>
              <b>{e[0]}</b> {e[1]} <span className="muted">· HCC {e[2]}</span>
              {rafTier(e[2]) && <span className={`pill ${rafTier(e[2])}`} style={{ marginLeft: 6 }}>{rafTagText(e[2])}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ f, value, disabled, onChange }: { f: HraField; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const v = value;
  if (f.type === "textarea")
    return (
      <div className="field"><label>{f.label}</label>
        <textarea rows={3} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} /></div>
    );
  if (f.type === "select")
    return (
      <div className="field"><label>{f.label}</label>
        <select disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select></div>
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
        </div></div>
    );
  }
  return (
    <div className="field"><label>{f.label}</label>
      <input type={f.type} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} /></div>
  );
}

// ---- component-scoped styling (Duolingo-style flow) ----
function FlowStyles() {
  return (
    <style>{`
.hraflow{--tl:#12a594;--tl-d:#0e8678;--cf:#1f9d6b;--up:#e0992a;--rs:#8595a6;--nv:#0f2c4d}
.hraflow .hf-top{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 18px;margin-bottom:16px}
.hraflow .hf-steplabel{font-size:15px;color:var(--nv)}
.hraflow .hf-gap{float:right;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;border-radius:99px;padding:5px 12px;background:#fff4ed;color:#c2410c}
.hraflow .hf-gap.clear{background:#eafaf1;color:#15803d;cursor:default}
.hraflow .hf-bar{height:9px;background:#e9eef4;border-radius:99px;overflow:hidden;margin-top:12px;clear:both}
.hraflow .hf-bar>i{display:block;height:100%;background:var(--tl);transition:width .3s}
.hraflow .hf-wrap{display:flex;gap:18px;align-items:flex-start}
.hraflow .hf-main{flex:2;min-width:0}
.hraflow .hf-rail{flex:1;max-width:280px;position:sticky;top:16px}
.hraflow .hf-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;margin-bottom:16px;box-shadow:0 6px 20px rgba(15,42,68,.05)}
.hraflow .hf-card h3{margin:0 0 4px;font-size:20px;color:var(--nv)}
.hraflow .hf-sub{margin-top:0;margin-bottom:16px}
.hraflow .hf-empty{background:#f8fafc;border:1px dashed var(--line);border-radius:14px;padding:18px;color:var(--muted);font-weight:600}
.hraflow .hf-cond{background:#f8fafc;border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px}
.hraflow .hf-cond-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.hraflow .hf-cond-name{font-weight:800;font-size:17px;color:var(--nv)}
.hraflow .hf-tri{display:inline-flex;border:2px solid var(--line);border-radius:13px;overflow:hidden;flex-wrap:wrap}
.hraflow .hf-tri .hf-t{border:none;border-right:2px solid var(--line);background:#fff;padding:10px 15px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;color:var(--nv)}
.hraflow .hf-tri .hf-t:last-child{border-right:none}
.hraflow .hf-t.c.on{background:var(--cf);color:#fff}.hraflow .hf-t.u.on{background:var(--up);color:#fff}.hraflow .hf-t.r.on{background:var(--rs);color:#fff}
.hraflow .hf-meat{margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)}
.hraflow .hf-lbl{display:block;font-weight:800;font-size:12px;margin-bottom:8px;color:var(--nv)}
.hraflow .hf-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.hraflow .hf-chip{border:2px solid var(--line);background:#fff;border-radius:11px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;color:var(--nv)}
.hraflow .hf-chip.on{background:var(--nv);color:#fff;border-color:var(--nv)}
.hraflow .hf-quote{width:100%;border:2px solid var(--line);border-radius:12px;padding:11px;font-family:inherit;font-size:14px;min-height:48px}
.hraflow .hf-search{position:relative}
.hraflow .hf-search input{width:100%;border:2px solid var(--tl);border-radius:12px;padding:11px;font-family:inherit;font-size:14px}
.hraflow .hf-results{border:1px solid var(--line);border-radius:12px;margin-top:6px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(15,42,68,.12)}
.hraflow .hf-result{padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line)}
.hraflow .hf-result:hover{background:#f3fdfb}
.hraflow .hf-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 18px}
.hraflow .btn.hf-next{background:var(--tl)}.hraflow .btn.hf-next:hover{background:var(--tl-d)}
.hraflow .hf-gapbox{background:#fff4ed;border:1px solid #f2c9bb;border-radius:14px;padding:14px 16px}
.hraflow .hf-okbox{background:#eafaf1;border:1px solid #bfe6d4;border-radius:14px;padding:14px 16px;color:#15803d}
.hraflow .hf-gapitem{padding:7px 0;cursor:pointer;font-weight:600;color:#c2410c}
.hraflow .hf-gapitem:hover{text-decoration:underline}
.hraflow .hf-rail .hf-meter{background:var(--nv);color:#fff;border-radius:16px;padding:18px;text-align:center;margin-bottom:12px}
.hraflow .hf-raf{font-size:38px;font-weight:900;line-height:1}
.hraflow .hf-money{font-size:13px;opacity:.85;font-weight:700;margin-top:4px}
.hraflow .hf-stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;margin-bottom:9px;font-weight:600;font-size:14px}
.hraflow .hf-stat.warn{color:#c2410c}.hraflow .hf-stat.ok{color:#15803d}
.hraflow .hf-priorlist{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.hraflow .hf-prow{display:flex;align-items:center;gap:9px;padding:5px 0;font-size:13px;font-weight:600}
.hraflow .hf-dot{width:10px;height:10px;border-radius:50%;flex:none}
.hraflow .hf-dot.none{background:#cbd5e1}.hraflow .hf-dot.confirm{background:var(--cf)}.hraflow .hf-dot.update{background:var(--up)}.hraflow .hf-dot.resolve{background:var(--rs)}
@media(max-width:820px){.hraflow .hf-wrap{flex-direction:column}.hraflow .hf-rail{max-width:none;width:100%;position:static}}
`}</style>
  );
}
