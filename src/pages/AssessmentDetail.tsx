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
  const [done, setDone] = useState(false);

  async function load() {
    const r = await apiGet(`/api/assessments/${id}`);
    setHra(r.assessment);
    setForm(r.assessment.form_data || {});
  }
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [id]);

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
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiPut(`/api/assessments/${hra!.id}`, { form_data: form });
      await apiPost(`/api/assessments/${hra!.id}/submit`);
      setDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };
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

  // ============ Full-screen guided visit (nurse, credentialed) ============
  if (editable && credentialed) {
    return (
      <div className="hra-device">
        <HraStyles />
        {/* top bar */}
        <div className="hd-top">
          <div className="hd-pt">{hra.patient_name || "Patient"}<small> · {hra.status}</small></div>
          <div className="hd-prog"><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
          <div className="hd-step">Step {step + 1}/{total} · {STEP_TITLES[step]}</div>
          {gaps.length > 0 ? (
            <button className="hd-gap" onClick={() => setStep(total - 1)}>⚑ {gaps.length} to check</button>
          ) : (
            <span className="hd-gap clear">✓ on track</span>
          )}
          <button className="hd-exit" onClick={() => nav(-1)} title="Exit visit">✕</button>
        </div>

        <div className="hd-body">
          <div className="hd-stage">
            {step === 0 && (
              <>
                <h1>Vitals</h1>
                <p className="hd-lede">Visit setting is pre-filled from the appointment; date defaults to today.</p>
                {renderFields(sectionByTitle("Visit")?.fields ?? [])}
              </>
            )}

            {step === 1 && (
              <>
                <h1>Dictate the visit</h1>
                <p className="hd-lede">Speak naturally — the scribe transcribes and pulls out vitals and codes.</p>
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
              </>
            )}

            {step === 2 && (
              <>
                <h1>Last year's conditions</h1>
                <p className="hd-lede">Address each one. Nothing carries forward unless you confirm it today.</p>
                {priors.length === 0 && (
                  <div className="hd-empty">No prior conditions on file for this patient yet. Document anything found today below.</div>
                )}
                {priors.map((p) => {
                  const key = priorKey(p);
                  const st = recapture[key];
                  const mk = meat[key] || { tags: [], quote: "" };
                  return (
                    <div className="hd-cond" key={key}>
                      <div className="hd-cond-top">
                        <div>
                          <div className="hd-cond-name">{p.label}</div>
                          <div className="hd-cond-sub">
                            {p.hcc != null ? `HCC ${p.hcc}` : "—"}
                            {rafTier(p.hcc ?? -1) && <span className={`pill ${rafTier(p.hcc ?? -1)}`} style={{ marginLeft: 8 }}>{rafTagText(p.hcc ?? -1)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="hd-tri">
                        <button className={`t c ${st === "confirm" ? "sel" : ""}`} onClick={() => recap(p, "confirm")}>✓ Confirm</button>
                        <button className={`t u ${st === "update" ? "sel" : ""}`} onClick={() => recap(p, "update")}>✎ Update</button>
                        <button className={`t r ${st === "resolve" ? "sel" : ""}`} onClick={() => recap(p, "resolve")}>✕ Resolved</button>
                      </div>
                      {st === "update" && (
                        <div className="hd-meat">
                          <label>Pick the specific code documented today</label>
                          <CodeSearch onPick={(e) => updatePriorTo(p, e)} />
                        </div>
                      )}
                      {(st === "confirm" || st === "update") && (
                        <div className="hd-meat">
                          <label>Evidence (MEAT)</label>
                          <div className="hd-chips">
                            {MEAT.map((m) => (
                              <button key={m} className={`hd-chip ${mk.tags.includes(m) ? "sel" : ""}`} onClick={() => toggleMeatTag(p, m)}>{m}</button>
                            ))}
                          </div>
                          <textarea className="hd-quote" placeholder="Supporting note…" value={mk.quote} onChange={(e) => setMeat(p, { quote: e.target.value })} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ marginTop: 18 }}>
                  <CodingPanel confirmed={confirmed} onChange={setConfirmed} editable={true} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1>Functional &amp; risk</h1>
                <p className="hd-lede">Quick taps — no typing.</p>
                {renderFields(sectionByTitle("Functional & risk screen")?.fields ?? [])}
              </>
            )}

            {step === 4 && (
              <>
                <h1>Care plan</h1>
                <p className="hd-lede">Recommendations and follow-up.</p>
                {renderFields(sectionByTitle("Plan")?.fields ?? [])}
              </>
            )}

            {step === 5 && (
              <>
                <h1>Photos &amp; files</h1>
                <p className="hd-lede">Wound photos, med lists — anything from the visit.</p>
                <PhotoCapture photos={photos} onChange={(p) => set("photos", p)} editable={true} />
              </>
            )}

            {step === 6 && (
              <>
                <h1>Review &amp; sign</h1>
                <p className="hd-lede">Last check before it goes to the doctor.</p>
                {gaps.length > 0 ? (
                  <div className="hd-gapbox">
                    <b>⚑ {gaps.length} thing{gaps.length > 1 ? "s" : ""} to check</b>
                    {gaps.map((g, i) => (<div key={i} className="hd-gapitem" onClick={() => setStep(g.step)}>• {g.t} →</div>))}
                  </div>
                ) : (
                  <div className="hd-gapbox clear"><b>✓ Nothing flagged — every prior condition addressed.</b></div>
                )}
                {confirmed.length > 0 && (
                  <>
                    <div className="hd-sumcards">
                      {confirmed.map((c) => (<div className="hd-sumcard" key={c.code + c.label}>{c.label}<small>{c.code} · HCC {c.hcc}</small></div>))}
                    </div>
                    <div className="hd-sumcards">
                      <div className="hd-sumcard hi">RAF {ratTotal.toFixed(2)}<small>risk captured</small></div>
                      <div className="hd-sumcard hi">{rafTotalMoney(ratTotal)}<small>est. annual value</small></div>
                    </div>
                  </>
                )}
                <div className="hd-attest">
                  <input type="checkbox" checked={form.attest === true} onChange={(e) => set("attest", e.target.checked)} />
                  <span>I, <strong>{profile.full_name}</strong>, attest that I personally conducted this assessment and that the information recorded is accurate to the best of my knowledge.</span>
                </div>
                <label style={{ fontWeight: 800, fontSize: 13, color: "#0f2a44" }}>Signature <span className="hd-lede" style={{ fontWeight: 500 }}>(optional — the checkbox is the legal e-signature either way)</span></label>
                <SignaturePad value={signature} onChange={(d) => set("nurse_signature", d)} editable={true} />
              </>
            )}
          </div>

          {/* rail */}
          <div className="hd-rail">
            <h4>Live scribe</h4>
            <div className="hd-scribe">
              {transcript ? transcript : <span className="cue">The transcript appears here as you dictate on the Dictate step — the nurse just talks and it fills the chart in.</span>}
            </div>
            <div className="hd-cap">
              <div className="raf">{ratTotal.toFixed(2)}<small>≈{rafTotalMoney(ratTotal)}/yr</small></div>
              <div className="sub">{confirmed.length} coded · {priors.length ? `${addressedPriors.length}/${priors.length} prior addressed` : "no priors on file"}</div>
              {priors.length > 0 && (
                <div className="hd-priorlist">
                  {priors.map((p) => {
                    const stt = recapture[priorKey(p)];
                    return (<div className="hd-prow" key={priorKey(p)}><span className={`hd-dot ${stt || "none"}`} />{p.label}</div>);
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* bottom nav */}
        <div className="hd-bottom">
          <button className="hd-nav back" onClick={goPrev} disabled={step === 0}>← Back</button>
          {step < total - 1 ? (
            <button className="hd-nav next go" onClick={goNext}>Next →</button>
          ) : (
            <>
              <button className="hd-nav back" onClick={saveDraft} disabled={busy}>Save draft</button>
              <button className="hd-nav next go" onClick={submit} disabled={busy}>Submit for review</button>
            </>
          )}
          <span className="hd-save">✓ autosaved</span>
        </div>

        {err && <div className="hd-err">{err}</div>}

        {done && (
          <div className="hd-done">
            <div className="check">✓</div>
            <h2>Visit complete</h2>
            <p>Sent for doctor review</p>
            <div className="big">RAF {ratTotal.toFixed(2)} · {rafTotalMoney(ratTotal)}/yr</div>
            <button onClick={() => nav("/assessments")}>Done</button>
          </div>
        )}
      </div>
    );
  }

  // ============ Credential gate / reviewer / read-only (normal portal layout) ============
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

      {!editable &&
        HRA_SECTIONS.map((section) => (
          <div className="card" key={section.title} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{section.title}</h3>
            {section.fields.map((f) => (
              <Field key={f.key} f={f} value={form[f.key]} disabled={true} onChange={() => {}} />
            ))}
          </div>
        ))}

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
    </div>
  );
}

// ---- inline ICD-10 / V28 search (recapture "Update") ----
function CodeSearch({ onPick }: { onPick: (e: IcdEntry) => void }) {
  const [q, setQ] = useState("");
  const results = q.trim().length >= 2 ? icdSearch(q) : [];
  return (
    <div className="hd-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a code or condition — e.g. E11.22 or chronic kidney" />
      {results.length > 0 && (
        <div className="hd-results">
          {results.map((e) => (
            <div key={e[0]} className="hd-result" onClick={() => { onPick(e); setQ(""); }}>
              <b>{e[0]}</b> {e[1]} <span style={{ color: "#6b7a8d" }}>· HCC {e[2]}</span>
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
    return (<div className="field"><label>{f.label}</label><textarea rows={3} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} /></div>);
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
  return (<div className="field"><label>{f.label}</label><input type={f.type} disabled={disabled} value={(v as string) || ""} onChange={(e) => onChange(e.target.value)} /></div>);
}

// ---- Full-screen "device" styling, ported from the prototype ----
function HraStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700;800;900&display=swap');
.hra-device{position:fixed;inset:0;z-index:1000;background:#eef1f5;color:#0f2236;
  font-family:Urbanist,system-ui,sans-serif;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
.hra-device *{box-sizing:border-box}
.hra-device .hd-top{display:flex;align-items:center;gap:14px;padding:13px 22px;background:#0f2a44;color:#fff;flex:none}
.hra-device .hd-pt{font-weight:800;font-size:15px;white-space:nowrap}
.hra-device .hd-pt small{opacity:.65;font-weight:600;text-transform:capitalize}
.hra-device .hd-prog{flex:1;height:8px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden;min-width:80px}
.hra-device .hd-prog>i{display:block;height:100%;background:#12a594;transition:width .4s}
.hra-device .hd-step{font-size:12px;font-weight:800;opacity:.9;white-space:nowrap}
.hra-device .hd-gap{background:#fff;color:#0f2a44;border:none;border-radius:99px;padding:7px 13px;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
.hra-device .hd-gap.clear{background:#e9f7f1;color:#1f9d6b;cursor:default}
.hra-device .hd-exit{background:rgba(255,255,255,.14);color:#fff;border:none;border-radius:10px;width:34px;height:34px;font-size:16px;cursor:pointer;font-family:inherit}
.hra-device .hd-body{flex:1;display:flex;min-height:0}
.hra-device .hd-stage{flex:1.9;overflow-y:auto;padding:32px 40px}
.hra-device .hd-stage h1{font-size:27px;margin:0 0 4px;font-weight:900;letter-spacing:-.5px;color:#0f2a44}
.hra-device .hd-lede{color:#6b7a8d;font-weight:600;margin:0 0 22px}
.hra-device .hd-empty{background:#f8fafc;border:1px dashed #e3e8ef;border-radius:16px;padding:20px;color:#6b7a8d;font-weight:600}
.hra-device .hd-rail{flex:1;max-width:340px;border-left:1px solid #e3e8ef;background:#fafbfc;display:flex;flex-direction:column;min-height:0}
.hra-device .hd-rail h4{margin:0;padding:16px 18px 8px;font-size:11px;letter-spacing:.08em;color:#6b7a8d;font-weight:800;text-transform:uppercase}
.hra-device .hd-scribe{flex:1;overflow-y:auto;padding:0 18px 12px;font-size:13.5px;line-height:1.55;color:#33485e;white-space:pre-wrap}
.hra-device .hd-scribe .cue{color:#9aa7b5;font-style:italic}
.hra-device .hd-cap{border-top:1px solid #e3e8ef;padding:16px 18px;background:#fff}
.hra-device .hd-cap .raf{font-size:34px;font-weight:900;color:#0f2a44;line-height:1}
.hra-device .hd-cap .raf small{font-size:14px;color:#1f9d6b;font-weight:800;margin-left:8px}
.hra-device .hd-cap .sub{font-size:12px;color:#6b7a8d;margin-top:6px;font-weight:700}
.hra-device .hd-priorlist{margin-top:12px;border-top:1px solid #eef2f5;padding-top:10px}
.hra-device .hd-prow{display:flex;align-items:center;gap:9px;padding:4px 0;font-size:13px;font-weight:600}
.hra-device .hd-dot{width:10px;height:10px;border-radius:50%;flex:none}
.hra-device .hd-dot.none{background:#cbd5e1}.hra-device .hd-dot.confirm{background:#1f9d6b}.hra-device .hd-dot.update{background:#e0992a}.hra-device .hd-dot.resolve{background:#8595a6}
.hra-device .hd-bottom{display:flex;align-items:center;gap:12px;padding:14px 22px;border-top:1px solid #e3e8ef;background:#fff;flex:none}
.hra-device .hd-save{margin-left:auto;font-size:12px;color:#1f9d6b;font-weight:700}
.hra-device .hd-nav{font-family:inherit;border-radius:14px;padding:13px 26px;font-weight:800;font-size:15px;cursor:pointer;border:none}
.hra-device .hd-nav.back{background:#eef2f7;color:#0f2a44}
.hra-device .hd-nav.next{background:#0f2a44;color:#fff}
.hra-device .hd-nav.go{background:#12a594;color:#fff}
.hra-device .hd-nav:disabled{opacity:.4;cursor:not-allowed}
/* condition recapture cards */
.hra-device .hd-cond{background:#f8fafc;border:1px solid #e3e8ef;border-radius:20px;padding:22px;margin-bottom:14px}
.hra-device .hd-cond-name{font-weight:900;font-size:18px;color:#0f2a44}
.hra-device .hd-cond-sub{color:#6b7a8d;font-weight:700;font-size:13px;margin-top:3px}
.hra-device .hd-tri{display:inline-flex;border:2px solid #e3e8ef;border-radius:14px;overflow:hidden;flex-wrap:wrap;margin-top:14px}
.hra-device .hd-tri .t{border:none;background:#fff;padding:12px 20px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;color:#0f2a44;border-right:2px solid #e3e8ef}
.hra-device .hd-tri .t:last-child{border-right:none}
.hra-device .hd-tri .t.c.sel{background:#1f9d6b;color:#fff}.hra-device .hd-tri .t.u.sel{background:#e0992a;color:#fff}.hra-device .hd-tri .t.r.sel{background:#8595a6;color:#fff}
.hra-device .hd-meat{margin-top:16px;padding-top:14px;border-top:1px dashed #e3e8ef}
.hra-device .hd-meat>label{display:block;font-weight:800;font-size:12px;margin-bottom:9px;color:#0f2a44}
.hra-device .hd-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.hra-device .hd-chip{border:2px solid #e3e8ef;background:#fff;border-radius:12px;padding:9px 15px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;color:#0f2a44}
.hra-device .hd-chip.sel{background:#0f2a44;color:#fff;border-color:#0f2a44}
.hra-device .hd-quote{width:100%;border:2px solid #e3e8ef;border-radius:14px;padding:13px;font-family:inherit;font-size:14px;min-height:54px}
.hra-device .hd-search input{width:100%;border:2px solid #12a594;border-radius:12px;padding:12px;font-family:inherit;font-size:14px}
.hra-device .hd-results{border:1px solid #e3e8ef;border-radius:12px;margin-top:6px;overflow:hidden;background:#fff;box-shadow:0 10px 28px rgba(15,42,68,.12)}
.hra-device .hd-result{padding:11px 13px;cursor:pointer;font-size:13px;border-bottom:1px solid #eef2f5}
.hra-device .hd-result:hover{background:#f3fdfb}
.hra-device .hd-gapbox{background:#fff7f3;border:1.5px solid #f2c9bb;border-radius:16px;padding:16px 18px;margin-bottom:18px}
.hra-device .hd-gapbox.clear{background:#e9f7f1;border-color:#bfe6d4}
.hra-device .hd-gapbox b{font-size:15px}
.hra-device .hd-gapitem{padding:7px 0;cursor:pointer;font-weight:600;color:#d6553f}
.hra-device .hd-gapitem:hover{text-decoration:underline}
.hra-device .hd-sumcards{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.hra-device .hd-sumcard{background:#f8fafc;border:1px solid #e3e8ef;border-radius:14px;padding:12px 16px;font-weight:800;font-size:14px}
.hra-device .hd-sumcard.hi{background:#e9f7f1}
.hra-device .hd-sumcard small{display:block;color:#6b7a8d;font-weight:700;font-size:11px;margin-top:3px}
.hra-device .hd-attest{display:flex;gap:12px;align-items:flex-start;background:#f8fafc;border:1px solid #e3e8ef;border-radius:16px;padding:16px;margin:16px 0}
.hra-device .hd-attest input{width:24px;height:24px;margin-top:2px;accent-color:#12a594;flex:none}
/* scoped overrides so reused components (Scribe, CodingPanel, PhotoCapture, SignaturePad, fields) adopt the look */
.hra-device .field{margin:0 0 20px}
.hra-device .field label,.hra-device label{font-weight:800;font-size:13px;color:#0f2a44}
.hra-device .field input,.hra-device .field select,.hra-device .field textarea,.hra-device input[type=text],.hra-device input[type=number],.hra-device input[type=date],.hra-device input[type=email],.hra-device select,.hra-device textarea{
  border:2px solid #e3e8ef;border-radius:12px;padding:11px 13px;font-family:inherit;font-size:15px;width:100%}
.hra-device .card{background:#fff;border:1px solid #e3e8ef;border-radius:18px;padding:22px;box-shadow:0 6px 20px rgba(15,42,68,.05);margin-bottom:14px}
.hra-device .card h3{margin-top:0;color:#0f2a44}
.hra-device .btn{background:#12a594;color:#fff;border:none;border-radius:13px;padding:11px 20px;font-weight:800;font-family:inherit;cursor:pointer;font-size:14px}
.hra-device .btn:hover{background:#0e8678}
.hra-device .btn.secondary,.hra-device .btn.sec,.hra-device .btn.ghost{background:#eef2f7;color:#0f2a44;border:none}
.hra-device .btn.sm{padding:7px 13px;font-size:13px;border-radius:11px}
.hra-device .pill{display:inline-block;border-radius:99px;padding:3px 10px;font-size:11px;font-weight:800}
.hra-device .pill.raf-hi{background:#e9f7f1;color:#1f9d6b}.hra-device .pill.raf-md{background:#fff4e0;color:#b26a00}.hra-device .pill.raf-lo{background:#eef2f5;color:#6b7a8d}
.hra-device .hd-err{position:absolute;bottom:78px;left:22px;right:22px;background:#fde8e7;color:#b3261e;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px}
.hra-device .hd-done{position:absolute;inset:0;background:rgba(15,42,68,.97);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;z-index:5;animation:hdfade .35s}
@keyframes hdfade{from{opacity:0}to{opacity:1}}
.hra-device .hd-done .check{width:96px;height:96px;border-radius:50%;background:#12a594;display:flex;align-items:center;justify-content:center;font-size:54px;margin-bottom:20px;animation:hdpop .5s}
@keyframes hdpop{0%{transform:scale(.3)}70%{transform:scale(1.12)}100%{transform:scale(1)}}
.hra-device .hd-done h2{font-size:32px;margin:0 0 8px;font-weight:900}
.hra-device .hd-done p{opacity:.85;font-weight:600;margin:4px 0}
.hra-device .hd-done .big{font-size:30px;font-weight:900;color:#12a594;margin:14px 0}
.hra-device .hd-done button{margin-top:22px;background:#fff;color:#0f2a44;border:none;border-radius:14px;padding:13px 30px;font-weight:800;cursor:pointer;font-family:inherit;font-size:15px}
@media(max-width:820px){.hra-device .hd-rail{display:none}.hra-device .hd-stage{padding:22px}}
`}</style>
  );
}
