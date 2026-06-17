// Auth state + session-timeout auto-logout.
//
// - Tracks the Identity Platform user and loads the matching app profile
//   (role) from the backend (/api/users/me).
// - Records a login event for the audit trail on first authenticated load.
// - Auto-logs-out after a period of inactivity (idle minutes come from the
//   backend session policy), satisfying the HIPAA session-timeout requirement.

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, User } from "firebase/auth";
import { auth } from "./firebase";
import { apiGet, apiPost, sessionPolicy } from "./api";
import { AppUser } from "./types";

interface AuthState {
  loading: boolean;
  fbUser: User | null;
  profile: AppUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idleMs = useRef(15 * 60 * 1000);
  const timer = useRef<number | undefined>(undefined);

  async function logout(reason?: string) {
    window.clearTimeout(timer.current);
    setProfile(null);
    await signOut(auth);
    if (reason) sessionStorage.setItem("logout_reason", reason);
  }

  // Reset the inactivity timer on user activity.
  function arm() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => logout("You were signed out after a period of inactivity."), idleMs.current);
  }

  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    const onActivity = () => { if (auth.currentUser) arm(); };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setFbUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
      try {
        const policy = await sessionPolicy().catch(() => null);
        if (policy?.idleMinutes) idleMs.current = policy.idleMinutes * 60 * 1000;
        arm();
        await apiPost("/api/login-event").catch(() => {});
        const me = await apiGet("/api/users/me");
        setProfile(me.user);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load your account");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    await signInWithEmailAndPassword(auth, email, password);
  }

  return (
    <Ctx.Provider value={{ loading, fbUser, profile, error, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
