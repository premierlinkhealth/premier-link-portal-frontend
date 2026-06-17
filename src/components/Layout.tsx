import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import { Role } from "../types";

const NAV: Record<Role, { to: string; label: string }[]> = {
  nurse: [
    { to: "/visits", label: "My Visits" },
    { to: "/assessments", label: "My Assessments" },
  ],
  doctor: [{ to: "/review", label: "Review Queue" }],
  admin: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/patients", label: "Patients" },
    { to: "/scheduling", label: "Scheduling" },
    { to: "/users", label: "Staff Accounts" },
    { to: "/assessments", label: "All Assessments" },
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();
  if (!profile) return null;
  const links = NAV[profile.role];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Premier Link</div>
        <div className="role">{profile.role}</div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {l.label}
          </NavLink>
        ))}
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="muted" style={{ fontSize: 14 }}>Staff Portal</div>
          <div className="row">
            <span className="muted" style={{ fontSize: 13 }}>{profile.full_name} · {profile.email}</span>
            <button className="btn secondary" onClick={() => logout()}>Sign out</button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
