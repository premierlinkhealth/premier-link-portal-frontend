import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api";
import { AppUser, Role } from "../../types";

export default function Users() {
  const [items, setItems] = useState<AppUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ full_name: string; email: string; role: Role }>({ full_name: "", email: "", role: "nurse" });

  async function load() {
    try { const r = await apiGet("/api/users"); setItems(r.users); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
  }
  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      await apiPost("/api/users/invite", form);
      setMsg(`Invite sent to ${form.email}. They set their own password via the emailed link.`);
      setForm({ full_name: "", email: "", role: "nurse" });
      load();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function deactivate(u: AppUser) {
    if (!confirm(`Deactivate ${u.full_name}? This immediately revokes their access.`)) return;
    await apiPost(`/api/users/${u.id}/deactivate`);
    load();
  }

  return (
    <div>
      <h1 className="page">Staff Accounts</h1>
      {err && <div className="error">{err}</div>}
      {msg && <div className="notice">{msg}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Invite a staff member</h3>
        <form onSubmit={invite}>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Full name</label><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
            <div className="field" style={{ flex: 1 }}><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="field" style={{ width: 140 }}><label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="nurse">Nurse</option><option value="doctor">Doctor</option><option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button className="btn" disabled={busy}>Send invite</button>
        </form>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>We never see or store passwords — the user sets their own via a one-time link.</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="muted">No accounts yet.</td></tr>}
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td>
                <td><span className={`badge ${u.status === "active" ? "approved" : "returned"}`}>{u.status}</span></td>
                <td style={{ textAlign: "right" }}>
                  {u.status === "active" && <button className="btn secondary" onClick={() => deactivate(u)}>Deactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
