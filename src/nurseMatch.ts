// Smart-scheduler matching: rank nurses for a given visit slot by availability,
// coverage area, distance, visit-type qualification, and credential clearance —
// the prototype's standout operational feature.

import { AppUser, Appointment, CredentialStatus, NurseProfile } from "./types";
import { cityDistanceMiles, weekdayOf } from "./geo";

const norm = (s?: string | null) => String(s ?? "").trim().toLowerCase();

/** Worst-case credential state across a nurse's checklist. */
export function credentialState(profile?: NurseProfile): CredentialStatus | "none" {
  const creds = profile?.credentials ?? [];
  if (creds.length === 0) return "none";
  if (creds.some((c) => c.status === "expired")) return "expired";
  if (creds.some((c) => c.status === "expiring")) return "expiring";
  return "cleared";
}

export interface SlotContext {
  patientCity?: string | null;
  visitType: string;
  scheduledAt: string; // ISO
  existingAppts: Appointment[]; // to detect time conflicts
}

export interface NurseMatch {
  nurse: AppUser;
  distanceMiles: number | null;
  coversCity: boolean;
  worksDay: boolean;
  doesVisitType: boolean;
  credStatus: CredentialStatus | "none";
  conflict: boolean;
  qualified: boolean;
  reasons: string[]; // positives + warnings, for the UI
}

const CONFLICT_WINDOW_MS = 60 * 60 * 1000; // ±1h counts as a clash

export function rankNurses(nurses: AppUser[], ctx: SlotContext): NurseMatch[] {
  const day = weekdayOf(ctx.scheduledAt);
  const slotMs = Date.parse(ctx.scheduledAt);

  const matches: NurseMatch[] = nurses.map((n) => {
    const p = n.profile ?? {};
    const worksDay = !day || (p.work_days ?? []).includes(day);
    const coversCity =
      !ctx.patientCity || (p.coverage_cities ?? []).some((c) => norm(c) === norm(ctx.patientCity));
    const doesVisitType = (p.visit_types ?? []).some((t) => norm(t) === norm(ctx.visitType));
    const cred = credentialState(p);
    const credOk = cred !== "expired";
    const distanceMiles = cityDistanceMiles(p.home_city, ctx.patientCity);

    const conflict =
      !Number.isNaN(slotMs) &&
      ctx.existingAppts.some(
        (a) =>
          a.nurse_id === n.id &&
          a.status === "scheduled" &&
          Math.abs(Date.parse(a.scheduled_at) - slotMs) < CONFLICT_WINDOW_MS
      );

    const qualified = worksDay && doesVisitType && credOk && !conflict;

    const reasons: string[] = [];
    if (coversCity) reasons.push("covers area");
    if (distanceMiles != null) reasons.push(`${distanceMiles} mi away`);
    if (worksDay && day) reasons.push(`works ${day}`);
    if (doesVisitType) reasons.push(ctx.visitType);
    if (cred === "expiring") reasons.push("⚠ credential expiring");
    if (cred === "expired") reasons.push("⛔ credential expired");
    if (!worksDay && day) reasons.push(`off on ${day}`);
    if (!doesVisitType) reasons.push(`doesn't do ${ctx.visitType}`);
    if (conflict) reasons.push("⛔ time conflict");

    return { nurse: n, distanceMiles, coversCity, worksDay, doesVisitType, credStatus: cred, conflict, qualified, reasons };
  });

  // Rank: qualified first, then covers-area, then nearer, then fewer warnings.
  return matches.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (a.coversCity !== b.coversCity) return a.coversCity ? -1 : 1;
    const da = a.distanceMiles ?? 9999;
    const db = b.distanceMiles ?? 9999;
    if (da !== db) return da - db;
    const warn = (m: NurseMatch) => (m.credStatus === "expiring" ? 1 : 0);
    return warn(a) - warn(b);
  });
}
