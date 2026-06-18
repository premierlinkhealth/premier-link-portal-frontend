// Editable nurse-profile fields shared by admin "Manage Nurses" and the nurse's
// own "My Account". Coverage cities, visit types, and work days are picked from
// fixed lists; the credential checklist is shown (admin-managed).

import { NurseProfile, Credential } from "../types";
import { ALL_CITIES } from "../geo";

const VISIT_TYPES = ["AWV", "Telehealth"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Chips({
  options, selected, onToggle,
}: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            type="button" key={o} onClick={() => onToggle(o)}
            className={`pill ${on ? "good" : ""}`}
            style={{ cursor: "pointer", border: on ? "1px solid var(--green)" : "1px solid var(--line)", background: on ? undefined : "#fff" }}
          >
            {on ? "✓ " : ""}{o}
          </button>
        );
      })}
    </div>
  );
}

export function credBadgeClass(status: Credential["status"]): string {
  return status === "cleared" ? "good" : status === "expiring" ? "warn" : "bad";
}

export default function NurseProfileForm({
  value, onChange,
}: { value: NurseProfile; onChange: (next: NurseProfile) => void }) {
  const p = value;
  const set = (patch: Partial<NurseProfile>) => onChange({ ...p, ...patch });

  return (
    <div>
      <div className="field">
        <label>Home city</label>
        <select value={p.home_city || ""} onChange={(e) => set({ home_city: e.target.value })}>
          <option value="">—</option>
          {ALL_CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Coverage cities <span className="muted" style={{ fontWeight: 400 }}>(where you'll travel)</span></label>
        <Chips options={ALL_CITIES} selected={p.coverage_cities || []} onToggle={(v) => set({ coverage_cities: toggle(p.coverage_cities || [], v) })} />
      </div>

      <div className="field">
        <label>Visit types</label>
        <Chips options={VISIT_TYPES} selected={p.visit_types || []} onToggle={(v) => set({ visit_types: toggle(p.visit_types || [], v) })} />
      </div>

      <div className="field">
        <label>Work days</label>
        <Chips options={DAYS} selected={p.work_days || []} onToggle={(v) => set({ work_days: toggle(p.work_days || [], v) })} />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Credentials <span className="muted" style={{ fontWeight: 400 }}>(managed by admin)</span></label>
        {(p.credentials || []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>No credentials on file.</p>}
        {(p.credentials || []).map((c) => (
          <div className="hca" key={c.item}>
            <span className={`pill ${credBadgeClass(c.status)}`}>{c.status}</span>
            <span style={{ fontWeight: 600 }}>{c.item}</span>
            {c.expiry && <span className="muted" style={{ fontSize: 12 }}>exp {c.expiry}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
