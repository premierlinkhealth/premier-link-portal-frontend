// Bulk member upload: paste or upload a CSV of an IPA's member list, auto-map
// columns, preview each row (ready / skip), then import — one patient per row
// through the existing create endpoint (member IDs auto-assigned server-side).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api";

const TEMPLATE =
  "first_name,last_name,dob,sex,insurance_id,street,city,state,zip,phone,language,ipa,line_of_business,emergency_contact,emergency_phone,hcc_conditions\n" +
  "Robert,Sample,1948-03-12,Male,MBI 1AA1-BB2-CC33,412 Spring Rd,Moorpark,CA,93021,(805) 555-0100,English,Coastal Valley IPA,Medicare Advantage,Susan Sample (daughter),(805) 555-0101,Type 2 diabetes (E1142); CHF (I5032)\n";

const ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "firstname", "first", "fname"],
  last_name: ["last_name", "lastname", "last", "lname", "surname"],
  dob: ["dob", "date_of_birth", "birthdate", "birth_date"],
  sex: ["sex", "gender"],
  insurance_id: ["insurance_id", "insurance", "mbi", "insurance_number"],
  street: ["street", "street_address", "address", "address1", "address_1"],
  city: ["city"],
  state: ["state", "st"],
  zip: ["zip", "zip_code", "zipcode", "postal_code"],
  phone: ["phone", "phone_number", "telephone"],
  language: ["language", "preferred_language"],
  ipa: ["ipa", "medical_group", "ipa_medical_group", "group", "ipa_name"],
  line_of_business: ["line_of_business", "lob", "plan_type"],
  emergency_contact: ["emergency_contact", "emergency_name", "emergency"],
  emergency_phone: ["emergency_phone", "emergency_contact_phone"],
  hcc_conditions: ["hcc_conditions", "hcc", "conditions", "diagnoses", "dx"],
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

interface ParsedRow { data: Record<string, string>; ready: boolean; note: string; }

function mapRows(rows: string[][]): ParsedRow[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) idx[field] = i;
  }
  return rows.slice(1).map((r) => {
    const get = (f: string) => (idx[f] != null ? (r[idx[f]] || "").trim() : "");
    const data: Record<string, string> = {};
    for (const f of Object.keys(ALIASES)) data[f] = get(f);
    const hasName = data.first_name && data.last_name;
    const hasDob = /^\d{4}-\d{2}-\d{2}$/.test(data.dob);
    const ready = !!hasName && hasDob;
    const note = !hasName ? "missing name" : !hasDob ? "DOB must be YYYY-MM-DD" : "ready";
    return { data, ready, note };
  });
}

function toPayload(d: Record<string, string>) {
  const conds = (d.hcc_conditions || "")
    .split(/[;|]/).map((s) => s.trim()).filter(Boolean); // stored as label strings
  return {
    full_name: `${d.first_name} ${d.last_name}`.trim(),
    date_of_birth: d.dob,
    sex: d.sex || null,
    insurance_id: d.insurance_id || null,
    address_street: d.street || null,
    address_city: d.city || null,
    address_state: d.state || null,
    address_zip: d.zip || null,
    phone: d.phone || null,
    language: d.language || null,
    medical_group: d.ipa || null,
    line_of_business: d.line_of_business || null,
    emergency_name: d.emergency_contact || null,
    emergency_phone: d.emergency_phone || null,
    hcc_history: conds,
  };
}

export default function BulkUpload() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function preview(raw: string) {
    setText(raw); setResult(null);
    try { setParsed(mapRows(parseCsv(raw))); setErr(null); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Could not parse CSV"); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => preview(String(reader.result || ""));
    reader.readAsText(f);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "premier-link-member-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function importReady() {
    const ready = parsed.filter((p) => p.ready);
    if (ready.length === 0) return;
    setBusy(true); setErr(null);
    let ok = 0, fail = 0;
    for (const p of ready) {
      try { await apiPost("/api/patients", toPayload(p.data)); ok++; }
      catch { fail++; }
    }
    setBusy(false);
    setResult(`Imported ${ok} patient${ok === 1 ? "" : "s"}${fail ? `, ${fail} failed` : ""}.`);
  }

  const readyCount = parsed.filter((p) => p.ready).length;

  return (
    <div>
      <button className="btn ghost" onClick={() => nav("/patients")} style={{ marginBottom: 8 }}>← Patients</button>
      <h1 className="page">Bulk member upload</h1>
      <p className="muted" style={{ marginTop: 0 }}>Upload an IPA's member list. Columns auto-map; member IDs are assigned on import.</p>
      {err && <div className="error">{err}</div>}
      {result && <div className="notice">{result} <Linkish onClick={() => nav("/patients")}>View patients →</Linkish></div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          <button className="btn secondary" onClick={downloadTemplate}>Download template</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>…or paste CSV below.</p>
        <textarea rows={4} value={text} onChange={(e) => preview(e.target.value)} placeholder="Paste CSV here" style={{ marginTop: 6 }} />
      </div>

      {parsed.length > 0 && (
        <>
          <div className="spread">
            <h3>Preview — {readyCount} ready, {parsed.length - readyCount} to skip</h3>
            <button className="btn" disabled={busy || readyCount === 0} onClick={importReady}>Import {readyCount} patient{readyCount === 1 ? "" : "s"}</button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th></th><th>Name</th><th>DOB</th><th>IPA</th><th>City</th><th>Conditions</th></tr></thead>
              <tbody>
                {parsed.map((p, i) => (
                  <tr key={i} style={{ opacity: p.ready ? 1 : 0.6 }}>
                    <td>{p.ready ? <span className="pill good">ready</span> : <span className="pill warn">{p.note}</span>}</td>
                    <td>{p.data.first_name} {p.data.last_name}</td>
                    <td className="muted">{p.data.dob || "—"}</td>
                    <td>{p.data.ipa || "—"}</td>
                    <td>{p.data.city || "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{p.data.hcc_conditions || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Linkish({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="btn ghost" style={{ padding: 0, color: "var(--teal)" }} onClick={onClick}>{children}</button>;
}
