// Admin "Manage Nurses": roster with coverage + credential status, inline profile
// edit, and approval of nurse-submitted profile changes.

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "../../api";
import { AppUser, NurseProfile } from "../../types";
import { credentialState } from "../../nurseMatch";
import NurseProfileForm, { credBadgeClass } from "../../components/NurseProfileForm";

export default function ManageNurses() {
  const [nurses, setNurses] = useState<AppUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<NurseProfile>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await apiGet("/api/users");
      setNurses((r.users as AppUser[]).filter((u) => u.role === "nurse"));
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  function startEdit(n: AppUser) {
    setEditing(n.id);
    setDraft(n.profile || {});
  }
  async function saveEdit(id: string) {
    setBusy(true); setErr(null);
    try {
      await apiPatch(`/api/users/${id}/profile`, { profile: draft });
      setEditing(null);
      await load();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function decide(id: string, action: "approve" | "reject") {
    setBusy(true); setErr(null);
    try { await apiPost(`/api/users/${id}/profile/${action}`); await load(); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  const pending = nurses.filter((n) => n.pending_profile);

  return (
    <div>
      <h1 className="page">Nurses</h1>
      <p className="muted" style={{ marginTop: 0 }}>Coverage, availability, and credentials that power the smart scheduler.</p>
      {err && <div className="error">{err}</div>}

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: "#f5d9a8" }}>
          <h3 style={{ marginTop: 0 }}>Pending profile changes ({pending.length})</h3>
          {pending.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div className="spread">
                <b>{n.full_name}</b>
                <div className="row">
                  <button className="btn" disabled={busy} onClick={() => decide(n.id, "approve")}>Approve</button>
                  <button className="btn secondary" disabled={busy} onClick={() => decide(n.id, "reject")}>Reject</button>
                </div>
              </div>
              <div className="row" style={{ gap: 24, marginTop: 8, flexWrap: "wrap" }}>
                <ProfileSummary title="Current" p={n.profile || {}} />
                <ProfileSummary title="Proposed" p={n.pending_profile || {}} highlight />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Home</th><th>Coverage</th><th>Visit types</th><th>Credentials</th><th></th></tr></thead>
          <tbody>
            {nurses.length === 0 && <tr><td colSpan={6} className="muted">No nurses yet.</td></tr>}
            {nurses.map((n) => {
              const cred = credentialState(n.profile);
              return (
                <tr key={n.id}>
                  <td><b>{n.full_name}</b>{n.status !== "active" && <span className="pill bad" style={{ marginLeft: 6 }}>inactive</span>}</td>
                  <td>{n.profile?.home_city || "—"}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{(n.profile?.coverage_cities || []).join(", ") || "—"}</td>
                  <td>{(n.profile?.visit_types || []).join(", ") || "—"}</td>
                  <td>{cred === "none" ? <span className="muted">—</span> : <span className={`pill ${credBadgeClass(cred as "cleared")}`}>{cred}</span>}</td>
                  <td style={{ textAlign: "right" }}><button className="btn secondary" onClick={() => startEdit(n)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Edit profile — {nurses.find((n) => n.id === editing)?.full_name}</h3>
          <NurseProfileForm value={draft} onChange={setDraft} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={() => saveEdit(editing)}>Save profile</button>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSummary({ title, p, highlight }: { title: string; p: NurseProfile; highlight?: boolean }) {
  return (
    <div style={{ minWidth: 200, flex: 1 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, color: highlight ? "var(--teal)" : undefined }}>{title}</div>
      <div style={{ fontSize: 13 }}>Home: {p.home_city || "—"}</div>
      <div style={{ fontSize: 13 }}>Coverage: {(p.coverage_cities || []).join(", ") || "—"}</div>
      <div style={{ fontSize: 13 }}>Types: {(p.visit_types || []).join(", ") || "—"}</div>
      <div style={{ fontSize: 13 }}>Days: {(p.work_days || []).join(", ") || "—"}</div>
    </div>
  );
}
