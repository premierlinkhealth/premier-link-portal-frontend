import { useState } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idleNote = sessionStorage.getItem("logout_reason");
  if (idleNote) sessionStorage.removeItem("logout_reason");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email.trim(), password);
    } catch (e: unknown) {
      setErr("Sign-in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="logo">Premier Link Health</div>
        <p className="muted" style={{ textAlign: "center", marginTop: 0, fontSize: 13 }}>
          Staff Portal — authorized users only
        </p>
        {idleNote && <div className="notice">{idleNote}</div>}
        {err && <div className="error">{err}</div>}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
          Accounts are created by an administrator. If you were invited, use the link in your email to set your password first.
        </p>
      </form>
    </div>
  );
}
