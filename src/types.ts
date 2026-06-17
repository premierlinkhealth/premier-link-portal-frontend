export type Role = "nurse" | "doctor" | "admin";
export type HraStatus = "draft" | "submitted" | "approved" | "returned";
export type ApptStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: "active" | "inactive";
}

export interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string;
  insurance_id: string | null;
  hcc_history: unknown[];
  notes: string | null;
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
}
