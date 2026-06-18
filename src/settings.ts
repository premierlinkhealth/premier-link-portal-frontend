// Operation settings shared by the dashboard (revenue), scheduler/nurse views
// (pay), and the Settings screen. Mirrors the backend app_settings JSON.

export interface AppSettings {
  visit_types: string[];
  rates: Record<string, number>; // default contracted rate per visit type
  ipa_rates: Record<string, Record<string, number>>; // per medical group → visit type → rate
  nurse_pay: Record<string, number>; // pay per visit type
  credential_items: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  visit_types: ["AWV", "Telehealth"],
  rates: { AWV: 175, Telehealth: 150 },
  ipa_rates: {},
  nurse_pay: { AWV: 75, Telehealth: 60 },
  credential_items: ["RN License", "Malpractice", "Board Certification", "CPR/BLS", "Background Check"],
};

/** Contracted rate Premier Link bills: IPA-specific override, else the default. */
export function rateFor(s: AppSettings, medicalGroup: string | null | undefined, visitType: string): number {
  const ipa = medicalGroup ? s.ipa_rates?.[medicalGroup] : undefined;
  if (ipa && typeof ipa[visitType] === "number") return ipa[visitType];
  return s.rates?.[visitType] ?? 0;
}

/** What a nurse earns for a visit type. */
export function nursePayFor(s: AppSettings, visitType: string): number {
  return s.nurse_pay?.[visitType] ?? 0;
}

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
