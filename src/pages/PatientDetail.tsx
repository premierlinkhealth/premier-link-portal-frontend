// Full patient record screen — the context page that hangs off every workflow.
// Admin can edit; a nurse linked to the patient can start/resume the HRA.

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import { useAuth } from "../auth";
import { Patient, Assessment } from "../types";
import { rafTier, rafTagText, rafTotal, rafTotalMoney, toConfirmed } from "../coding";
import { readConditions } from "../components/ConditionsEditor";

function ageOf(dob?: string | null): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return `${a} yo`;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{children}</div>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState<Patient | null>(null);
  const [hras, setHras] = useState<Assessment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet(`/api/patients/${id}`).then((r) => setP(r.patient)).catch((e) => setErr(e.message));
    apiGet(`/api/assessments`).then((r) => setHras(r.assessments || [])).catch(() => {});
  }, [id]);

  if (err) return <div className="error">{err}</div>;
  if (!p || !profile) return <div className="center-note">Loading…</div>;

  const isAdmin = profile.role === "admin";
  const isNurse = profile.role === "nurse";

  const conds = readConditions(p.hcc_history);
  const legacy = (Array.isArray(p.hcc_history) ? p.hcc_history : []).filter((x) => typeof x === "string") as string[];
  const rafT = rafTotal(conds.map((c) => toConfirmed([c.code, c.label, c.hcc])));

  const addr = [p.address_street, [p.address_city, p.address_state].filter(Boolean).join(", "), p.address_zip]
    .filter(Boolean).join(" ");
  const mapsUrl = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : "";

  // Most relevant assessment for this patient (latest by update order from API).
  const hra = hras.find((h) => h.patient_id === p.id) || null;
  const hraStatus = hra?.status;

  async function startHra() {
    setBusy(true); setErr(null);
    try {
      const existing = hras.find((h) => h.patient_id === p!.id);
      if (existing) { nav(`/assessments/${existing.id}`); return; }
      const r = await apiPost("/api/assessments", { patient_id: p!.id });
      nav(`/assessments/${r.assessment.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not start the HRA");
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn ghost" onClick={() => nav(-1)} style={{ marginBottom: 8 }}>← Back</button>
      <div className="spread">
        <div>
          <h1 className="page" style={{ marginBottom: 4 }}>
            {p.full_name}{" "}
            {p.line_of_business && <span className="pill blue" style={{ verticalAlign: "middle" }}>{p.line_of_business}</span>}
          </h1>
          <p className="muted" style={{ marginTop: 0 }}>
            <b style={{ color: "var(--teal)" }}>{p.member_id || "—"}</b> · DOB {p.date_of_birth} ({ageOf(p.date_of_birth)}) · {p.insurance_id || "—"}
          </p>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          {isAdmin && <Link className="btn secondary" to={`/patients/${p.id}/edit`}>Edit patient</Link>}
          {isNurse && (
            <button className="btn" onClick={startHra} disabled={busy}>
              {hraStatus === "draft" || hraStatus === "returned" ? "Resume HRA" : hra ? "Open HRA" : "Start HRA visit"}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Patient information</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 8 }}>
          <Info label="Address">
            {addr || "—"}{" "}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>· Map</a>}
          </Info>
          <Info label="Phone">{p.phone || "—"}</Info>
          <Info label="Sex">{p.sex || "—"}</Info>
          <Info label="Preferred language">{p.language || "—"}</Info>
          <Info label="IPA / medical group">{p.medical_group || "—"}</Info>
          <Info label="Line of business">{p.line_of_business || "—"}</Info>
          <Info label="Insurance ID">{p.insurance_id || "—"}</Info>
          <Info label="Emergency contact">{p.emergency_name || "—"}</Info>
          <Info label="Emergency phone">{p.emergency_phone || "—"}</Info>
        </div>
        {p.notes && (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>Notes</div>
            <div>{p.notes}</div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spread">
          <h3 style={{ marginTop: 0 }}>Known HCC conditions</h3>
          {hraStatus && <span className={`badge ${hraStatus}`}>{hraStatus}</span>}
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>From the medical group's file (entered by admin).</p>
        {conds.map((c) => (
          <div className="hca" key={c.code}>
            <span className="pill blue">HCC {c.hcc}</span>
            <span style={{ fontWeight: 600 }}>{c.label}</span>
            <span className="muted" style={{ fontSize: 12 }}>{c.code}</span>
            {rafTier(c.hcc) && <span className={`pill ${rafTier(c.hcc)}`}>{rafTagText(c.hcc)}</span>}
          </div>
        ))}
        {legacy.map((s, i) => (
          <div className="hca" key={`l-${i}`}><span className="pill blue">HCC</span> <span>{s}</span></div>
        ))}
        {conds.length === 0 && legacy.length === 0 && <p className="muted">No conditions on file.</p>}
        {conds.length > 0 && (
          <div className="raf-summary">
            <span>
              <span className="muted" style={{ fontSize: 12 }}>Chart RAF total</span><br />
              <span className="big">{rafT.toFixed(3)}</span>
            </span>
            <span>
              <span className="muted" style={{ fontSize: 12 }}>Est. annual value (demo)</span><br />
              <span className="money">{rafTotalMoney(rafT)}</span>
            </span>
          </div>
        )}
      </div>

      {hra && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Assessment</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Status: <span className={`badge ${hra.status}`}>{hra.status}</span>
            {hra.signed_at ? ` · signed ${new Date(hra.signed_at).toLocaleDateString()}` : ""}
          </p>
          <Link className="btn secondary" to={`/assessments/${hra.id}`}>Open assessment</Link>
        </div>
      )}
    </div>
  );
}
