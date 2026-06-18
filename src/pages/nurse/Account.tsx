// Nurse self-service "My Account": edit coverage, availability, and visit types.
// Changes are submitted for admin approval (held as pending_profile) — the live
// profile keeps driving scheduling until approved.

import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../../api";
import { NurseProfile } from "../../types";
import NurseProfileForm from "../../components/NurseProfileForm";

export default function Account() {
  const [profile, setProfile] = useState<NurseProfile>({});
  const [draft, setDraft] = useState<NurseProfile>({});
  const [pending, setPending] = useState<NurseProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await apiGet("/api/users/me/profile");
      setProfile(r.profile || {});
      setDraft(r.pending_profile || r.profile || {});
      setPending(r.pending_profile || null);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      // Credentials stay admin-managed: never send them from self-service.
      const { credentials: _omit, ...editable } = draft;
      void _omit;
      await apiPut("/api/users/me/profile", { profile: { ...editable, credentials: profile.credentials } });
      setMsg("Submitted for admin approval. Your current schedule stays active until it's approved.");
      await load();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Submit failed"); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page">My Account</h1>
      <p className="muted" style={{ marginTop: 0 }}>Update your coverage area, availability, and visit types. Changes go to admin for approval.</p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="notice">{msg}</div>}
      {pending && !msg && (
        <div className="banner" style={{ marginBottom: 16 }}>
          You have changes awaiting admin approval. Your current schedule stays active until then.
        </div>
      )}

      <div className="card">
        <NurseProfileForm value={draft} onChange={setDraft} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={submit}>Submit for approval</button>
          <button className="btn ghost" onClick={() => setDraft(profile)}>Reset</button>
        </div>
      </div>
    </div>
  );
}
