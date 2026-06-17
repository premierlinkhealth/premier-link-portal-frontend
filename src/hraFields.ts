// PROVISIONAL Health Risk Assessment field set.
//
// ⚠️ These fields are a working placeholder so the form is usable end-to-end.
// The FINAL field set must be approved by the healthcare attorney / compliance
// advisor before go-live (it drives Medicare HCC coding). Because the backend
// stores the assessment as flexible JSON, the approved field list drops straight
// in here without any backend change — just edit this file.

export type HraField =
  | { key: string; label: string; type: "text" | "textarea" | "date" | "number" }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "checkboxes"; options: string[] };

export interface HraSection {
  title: string;
  fields: HraField[];
}

export const HRA_SECTIONS: HraSection[] = [
  {
    title: "Visit",
    fields: [
      { key: "visit_date", label: "Visit date", type: "date" },
      { key: "visit_type", label: "Visit type", type: "select", options: ["In-home", "Telehealth", "In-office"] },
      { key: "bp", label: "Blood pressure", type: "text" },
      { key: "pulse", label: "Pulse", type: "number" },
      { key: "weight_lbs", label: "Weight (lbs)", type: "number" },
    ],
  },
  {
    title: "Chronic conditions (confirm / update)",
    fields: [
      {
        key: "conditions",
        label: "Conditions present today",
        type: "checkboxes",
        options: [
          "Diabetes", "Hypertension", "COPD", "CHF", "CKD",
          "Depression", "Atrial fibrillation", "Vascular disease",
        ],
      },
      { key: "conditions_notes", label: "Condition notes / new findings", type: "textarea" },
    ],
  },
  {
    title: "Functional & risk screen",
    fields: [
      { key: "fall_risk", label: "Fall risk", type: "select", options: ["Low", "Moderate", "High"] },
      { key: "cognition", label: "Cognitive screen", type: "select", options: ["Normal", "Mild concern", "Refer"] },
      { key: "depression_phq2", label: "PHQ-2 score", type: "number" },
      { key: "adl_independent", label: "Independent in daily activities?", type: "select", options: ["Yes", "Partial", "No"] },
    ],
  },
  {
    title: "Plan",
    fields: [
      { key: "care_gaps", label: "Care gaps / recommendations", type: "textarea" },
      { key: "follow_up", label: "Follow-up needed", type: "text" },
    ],
  },
];
