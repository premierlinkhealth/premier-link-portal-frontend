export type Role = "nurse" | "doctor" | "admin";
export type HraStatus = "draft" | "submitted" | "approved" | "returned";
export type ApptStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export type CredentialStatus = "cleared" | "expiring" | "expired";

export interface Credential {
  item: string;
  status: CredentialStatus;
  expiry?: string;
}

export interface NurseProfile {
  home_city?: string;
  coverage_cities?: string[];
  visit_types?: string[];
  work_days?: string[]; // "Mon".."Sun"
  credentials?: Credential[];
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: "active" | "inactive";
  profile?: NurseProfile;
  pending_profile?: NurseProfile | null;
}

/** A structured prior/known condition stored in hcc_history. */
export interface PatientCondition {
  code: string;
  label: string;
  hcc: number;
}

export interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string;
  insurance_id: string | null;
  hcc_history: unknown[];
  notes: string | null;
  member_id: string | null;
  sex: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  language: string | null;
  medical_group: string | null;
  line_of_business: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
}

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name?: string;
  nurse_id: string | null;
  nurse_name?: string;
  scheduled_at: string;
  location: string | null;
  visit_type: string;
  status: ApptStatus;
}

export interface Assessment {
  id: string;
  patient_id: string;
  patient_name?: string;
  nurse_id: string;
  nurse_name?: string;
  doctor_name?: string;
  appointment_id: string | null;
  form_data: Record<string, unknown>;
  status: HraStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  doctor_notes: string | null;
  signed_at: string | null;
  pdf_path: string | null;
  created_at?: string;
  updated_at?: string;
}
