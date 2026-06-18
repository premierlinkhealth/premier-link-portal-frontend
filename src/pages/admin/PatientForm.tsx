// Add / edit a full patient record (admin). Rich field set mirrored from the
// prototype: identity, address, contact, IPA/medical group, line of business,
// emergency contact, and structured HCC conditions.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost, apiPut } from "../../api";
import { Patient, PatientCondition } from "../../types";
import ConditionsEditor, { readConditions } from "../../components/ConditionsEditor";

const LOB = ["Medicare Advantage", "Medicare FFS", "Medi-Cal", "Dual (Medi-Medi)", "Commercial", "Other"];
const SEX = ["Female", "Male", "Other"];

interface FormState {
  full_name: string; date_of_birth: string; sex: string; insurance_id: string; member_id: string;
  address_street: string; address_city: string; address_state: string; address_zip: string;
  phone: string; language: string; medical_group: string; line_of_business: string;
  emergency_name: string; emergency_phone: string; notes: string;
}

const EMPTY: FormState = {
  full_name: "", date_of_birth: "", sex: "", insurance_id: "", member_id: "",
  address_street: "", address_city: "", address_state: "", address_zip: "",
  phone: "", language: "", medical_group: "", line_of_business: "",
  emergency_name: "", emergency_phone: "", notes: "",
};

function fromPatient(p: Patient): FormState {
  return {
    full_name: p.full_name || "", date_of_birth: p.date_of_birth || "", sex: p.sex || "",
    insurance_id: p.insurance_id || "", member_id: p.member_id || "",
    address_street: p.address_street || "", address_city: p.address_city || "",
    address_state: p.address_state || "", address_zip: p.address_zip || "",
    phone: p.phone || "", language: p.language || "", medical_group: p.medical_group || "",
    line_of_business: p.line_of_business || "", emergency_name: p.emergency_name || "",
    emergency_phone: p.emergency_phone || "", notes: p.notes || "",
  };
}

export default function PatientForm({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState<FormState>(EMPTY);
  const [conds, setConds] = useState<PatientCondition[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "edit" && id) {
      apiGet(`/api/patients/${id}`)
        .then((r) => { setF(fromPatient(r.patient)); setConds(readConditions(r.patient.hcc_history)); })
        .catch((e) => setErr(e.message));
    }
  }, [mode, id]);

  const set = (k: keyof FormState, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.full_name.trim() || !f.date_of_birth) { setErr("Full name and date of birth are required."); return; }
    setBusy(true); setErr(null);
    const payload = {
      ...f,
      member_id: f.member_id.trim() || null,
      hcc_history: conds,
    };
    // Blank-string optional fields → null for tidiness.
    for (const k of Object.keys(payload) as (keyof typeof payload)[]) {
      if (typeof payload[k] === "string" && (payload[k] as string).trim() === "") (payload as Record<string, unknown>)[k] = null;
    }
    payload.full_name = f.full_name.trim();
    payload.hcc_history = conds;
    try {
      if (mode === "edit" && id) {
        await apiPut(`/api/patients/${id}`, payload);
        nav(`/patients/${id}`);
      } else {
        const r = await apiPost("/api/patients", payload);
        nav(`/patients/${r.patient.id}`);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn ghost" onClick={() => nav(-1)} style={{ marginBottom: 8 }}>← Cancel</button>
      <h1 className="page">{mode === "edit" ? "Edit patient" : "Add a patient"}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {mode === "edit" ? "Update this patient record." : "Keyed in from the medical group's member file. A member ID is assigned automatically."}
      </p>
      {err && <div className="error">{err}</div>}

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Identity</h3>
          <div className="field"><label>Full name *</label><input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} required /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Date of birth *</label><input type="date" value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Sex</label>
              <select value={f.sex} onChange={(e) => set("sex", e.target.value)}><option value="">—</option>{SEX.map((o) => <option key={o}>{o}</option>)}</select>
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Insurance ID (MBI)</label><input value={f.insurance_id} onChange={(e) => set("insurance_id", e.target.value)} placeholder="MBI …" /></div>
            <div className="field" style={{ flex: 1 }}><label>Member ID</label><input value={f.member_id} onChange={(e) => set("member_id", e.target.value)} placeholder={mode === "new" ? "Auto (PL-####)" : ""} /></div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Address & contact</h3>
          <div className="field"><label>Street address</label><input value={f.address_street} onChange={(e) => set("address_street", e.target.value)} /></div>
          <div className="row">
            <div className="field" style={{ flex: 2 }}><label>City</label><input value={f.address_city} onChange={(e) => set("address_city", e.target.value)} /></div>
            <div className="field" style={{ width: 90, flex: "none" }}><label>State</label><input value={f.address_state} onChange={(e) => set("address_state", e.target.value)} /></div>
            <div className="field" style={{ width: 120, flex: "none" }}><label>ZIP</label><input value={f.address_zip} onChange={(e) => set("address_zip", e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Phone</label><input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Preferred language</label><input value={f.language} onChange={(e) => set("language", e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Emergency contact</label><input value={f.emergency_name} onChange={(e) => set("emergency_name", e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Emergency phone</label><input value={f.emergency_phone} onChange={(e) => set("emergency_phone", e.target.value)} /></div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Coverage</h3>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>IPA / medical group</label><input value={f.medical_group} onChange={(e) => set("medical_group", e.target.value)} placeholder="e.g. Coastal Valley IPA" /></div>
            <div className="field" style={{ flex: 1 }}><label>Line of business</label>
              <select value={f.line_of_business} onChange={(e) => set("line_of_business", e.target.value)}><option value="">—</option>{LOB.map((o) => <option key={o}>{o}</option>)}</select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Known conditions</h3>
          <ConditionsEditor value={conds} onChange={setConds} />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Notes</h3>
          <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else from the member file…" />
        </div>

        <div className="row">
          <button type="button" className="btn secondary" onClick={() => nav(-1)} disabled={busy}>Cancel</button>
          <button className="btn" disabled={busy}>{mode === "edit" ? "Save changes" : "Save patient"}</button>
        </div>
      </form>
    </div>
  );
}
