import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import { Role } from "../types";

const NAV: Record<Role, { to: string; label: string }[]> = {
  nurse: [
    { to: "/home", label: "Dashboard" },
    { to: "/visits", label: "My Visits" },
    { to: "/assessments", label: "My Assessments" },
    { to: "/hcc-reference", label: "HCC Reference" },
    { to: "/account", label: "My Account" },
  ],
  doctor: [
    { to: "/review", label: "Review Queue" },
    { to: "/hcc-reference", label: "HCC Reference" },
  ],
  admin: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/patients", label: "Patients" },
    { to: "/scheduling", label: "Scheduling" },
    { to: "/nurses", label: "Nurses" },
    { to: "/users", label: "Staff Accounts" },
    { to: "/assessments", label: "All Assessments" },
    { to: "/hcc-reference", label: "HCC Reference" },
    { to: "/settings", label: "Settings" },
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
        <div className="demo-banner">
          Pre-launch environment — sample data only. Not yet cleared for real patient information (PHI).
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
