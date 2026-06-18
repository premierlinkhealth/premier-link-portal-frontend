// "What changed this visit" delta engine + review-queue statistics.
//
// Ports the prototype's signature feature: diff the conditions a nurse confirmed
// this visit against the patient's known prior HCC history, and express the
// change as added / resolved / carried conditions plus the net RAF (and ≈$/yr)
// movement. The prior baseline already lives inside each assessment's
// form_data.hcc_history (the backend pre-populates it when the draft is created),
// so this is pure client logic — no backend change.

import { ConfirmedCode, rafOf, icdByCode, RAF_BENCHMARK } from "./coding";

/** A prior condition normalized from the patient's (free-shape) hcc_history. */
export interface PriorCond {
  hcc: number | null;
  label: string;
  raf: number;
}

export interface VisitDelta {
  added: ConfirmedCode[]; // confirmed this visit, not on the prior chart
  resolved: PriorCond[]; // on the prior chart, not confirmed this visit
  carried: ConfirmedCode[]; // confirmed this visit and already on the chart
  rafDelta: number; // net RAF change (added − resolved)
  baseCount: number; // how many conditions were on the chart coming in
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * Turn one hcc_history entry — which may be a bare HCC number, an ICD-10 code
 * string, a condition-label string, or an object — into a comparable PriorCond.
 * Matching is keyed on the HCC category whenever we can resolve one; otherwise
 * we fall back to the condition label.
 */
export function normalizePrior(item: unknown): PriorCond {
  // Bare HCC category number.
  if (typeof item === "number") {
    return { hcc: item, label: `HCC ${item}`, raf: rafOf(item) || 0 };
  }
  // String: an ICD-10 code we can resolve, or a free-text label.
  if (typeof item === "string") {
    const e = icdByCode(item.replace(/\./g, "").toUpperCase());
    if (e) return { hcc: e[2], label: e[1], raf: rafOf(e[2]) || 0 };
    return { hcc: null, label: item, raf: 0 };
  }
  // Object: pull whatever identifying fields exist.
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const rawCode = (o.code ?? o.icd ?? o.icd10) as string | undefined;
    let hcc =
      typeof o.hcc === "number"
        ? (o.hcc as number)
        : typeof o.hcc === "string" && o.hcc.trim() !== ""
        ? Number(o.hcc)
        : null;
    let label = (o.label ?? o.name ?? o.description ?? rawCode ?? "Condition") as string;
    if (hcc == null && rawCode) {
      const e = icdByCode(String(rawCode).replace(/\./g, "").toUpperCase());
      if (e) {
        hcc = e[2];
        if (!o.label && !o.name) label = e[1];
      }
    }
    if (hcc != null && Number.isNaN(hcc)) hcc = null;
    return { hcc, label: String(label), raf: hcc != null ? rafOf(hcc) || 0 : 0 };
  }
  return { hcc: null, label: "Condition", raf: 0 };
}

/** Normalize a whole hcc_history array (tolerant of null / non-array input). */
export function normalizePriors(hccHistory: unknown): PriorCond[] {
  if (!Array.isArray(hccHistory)) return [];
  return hccHistory.map(normalizePrior);
}

/** True if a prior condition is represented among the confirmed codes. */
function priorIsConfirmed(p: PriorCond, confirmed: ConfirmedCode[]): boolean {
  if (p.hcc != null) return confirmed.some((c) => c.hcc === p.hcc);
  return confirmed.some((c) => norm(c.label) === norm(p.label));
}

/** True if a confirmed code was already on the prior chart. */
function confirmedIsPrior(c: ConfirmedCode, priors: PriorCond[]): boolean {
  return priors.some((p) =>
    p.hcc != null ? p.hcc === c.hcc : norm(p.label) === norm(c.label)
  );
}

/**
 * Compute the visit delta. `confirmed` is the nurse's confirmed_codes for this
 * visit; `hccHistory` is the patient's prior chart (form_data.hcc_history).
 */
export function computeDelta(hccHistory: unknown, confirmed: ConfirmedCode[]): VisitDelta {
  const priors = normalizePriors(hccHistory);
  const conf = Array.isArray(confirmed) ? confirmed : [];

  const carried = conf.filter((c) => confirmedIsPrior(c, priors));
  const added = conf.filter((c) => !confirmedIsPrior(c, priors));
  const resolved = priors.filter((p) => !priorIsConfirmed(p, conf));

  const addedRaf = added.reduce((s, c) => s + (c.raf || 0), 0);
  const resolvedRaf = resolved.reduce((s, p) => s + (p.raf || 0), 0);

  return {
    added,
    resolved,
    carried,
    rafDelta: addedRaf - resolvedRaf,
    baseCount: priors.length,
  };
}

/** ≈$/yr implied by a RAF amount, formatted like the prototype ("≈$3.2k/yr"). */
export function rafDeltaMoney(raf: number): string {
  const yr = Math.abs(raf) * RAF_BENCHMARK;
  const sign = raf < 0 ? "−" : "+";
  const body = yr >= 1000 ? (yr / 1000).toFixed(1) + "k" : String(Math.round(yr));
  return `${sign}≈$${body}/yr`;
}

// ---------------------------------------------------------------------------
// Review-queue statistics
// ---------------------------------------------------------------------------

/** Minimal shape these helpers read off an assessment row. */
export interface QueueRow {
  status: string;
  created_at?: string;
  updated_at?: string;
  reviewed_at?: string | null;
  signed_at?: string | null;
}

const MS_HOUR = 3_600_000;

/** Whole hours a submitted chart has been waiting (since it was submitted). */
export function hoursWaiting(row: QueueRow, now: number = Date.now()): number {
  const t = row.updated_at ? Date.parse(row.updated_at) : NaN;
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / MS_HOUR));
}

/** Compact "5h" / "2d 3h" wait label. */
export function waitLabel(hours: number): string {
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export interface QueueStats {
  waiting: number;
  oldestWaitHours: number;
  signedThisWeek: number;
  avgTurnaroundHours: number;
  breaches48h: number; // waiting charts older than 48h
}

export function queueStats(rows: QueueRow[], now: number = Date.now()): QueueStats {
  const pending = rows.filter((r) => r.status === "submitted");
  const approved = rows.filter((r) => r.status === "approved" && r.signed_at);

  const oldest = pending.reduce((m, r) => Math.max(m, hoursWaiting(r, now)), 0);
  const breaches = pending.filter((r) => hoursWaiting(r, now) > 48).length;

  const weekAgo = now - 7 * 24 * MS_HOUR;
  const signedThisWeek = approved.filter(
    (r) => r.signed_at && Date.parse(r.signed_at) >= weekAgo
  ).length;

  const turns = approved
    .map((r) => {
      const start = r.created_at ? Date.parse(r.created_at) : NaN;
      const end = r.signed_at ? Date.parse(r.signed_at) : NaN;
      return Number.isNaN(start) || Number.isNaN(end) ? NaN : Math.max(0, (end - start) / MS_HOUR);
    })
    .filter((h) => !Number.isNaN(h));
  const avgTurnaround = turns.length ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length) : 0;

  return {
    waiting: pending.length,
    oldestWaitHours: oldest,
    signedThisWeek,
    avgTurnaroundHours: avgTurnaround,
    breaches48h: breaches,
  };
}
