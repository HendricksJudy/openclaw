/**
 * ClawHospital - Medical Agents barrel export
 *
 * All medical AI agents and their configurations.
 */

export {
  PRE_CONSULTATION_SYSTEM_PROMPT,
  preConsultationTools,
  type PreConsultationReport,
} from "./pre-consultation.ts";

export {
  DIAGNOSIS_ASSIST_SYSTEM_PROMPT,
  diagnosisAssistTools,
  type DiagnosisSuggestion,
  type DiagnosisAssistOutput,
} from "./diagnosis-assist.ts";

export {
  MEDICATION_REVIEW_SYSTEM_PROMPT,
  medicationReviewTools,
  type DrugInteraction,
  type AllergyAlert,
  type DoseAlert,
  type MedicationReviewOutput,
} from "./medication-review.ts";

export {
  EMR_QUALITY_SYSTEM_PROMPT,
  emrQualityTools,
  type QualityIssue,
  type QualityReport,
} from "./emr-quality.ts";

export {
  PATIENT_SERVICE_SYSTEM_PROMPT,
  patientServiceTools,
  type FollowUpPlan,
  type PatientInquiryResult,
} from "./patient-service.ts";
