/**
 * ClawHospital - Pre-Consultation Agent [A01]
 *
 * Converses with patients via any OpenClaw channel (WhatsApp, Telegram, Web, SMS…)
 * to collect chief complaint, history of present illness, past medical history,
 * allergies, and current medications.
 *
 * Outputs a structured pre-consultation report that feeds directly into the
 * outpatient/inpatient doctor workstation.
 *
 * Leverages:
 *   - OpenClaw Agent runtime (pi-embedded-runner)
 *   - OpenClaw multi-channel session management
 *   - Medical knowledge skills for triage guidance
 */

export interface PreConsultationReport {
  patientId: string;
  channelId: string;
  collectedAt: string;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string[];
  surgicalHistory: string[];
  medications: Array<{ name: string; dosage?: string; frequency?: string }>;
  allergies: Array<{ substance: string; reaction?: string; severity?: string }>;
  familyHistory: string[];
  socialHistory: {
    smoking?: string;
    alcohol?: string;
    occupation?: string;
    exerciseFrequency?: string;
  };
  reviewOfSystems: Record<string, string[]>;
  suggestedDepartment?: string;
  urgencyLevel: "low" | "moderate" | "high" | "emergency";
  rawTranscript: string;
}

/**
 * System prompt for the Pre-Consultation Agent.
 *
 * Loaded by the OpenClaw Agent runtime when a "pre-consultation" session is
 * started for a patient channel binding.
 */
export const PRE_CONSULTATION_SYSTEM_PROMPT = `You are a friendly and professional medical pre-consultation assistant for ClawHospital.
Your role is to gather essential medical information from the patient before they see a doctor.

## Instructions
1. Start by greeting the patient warmly and explaining that you'll be collecting some information to help their doctor prepare for the visit.
2. Ask questions ONE AT A TIME — never overwhelm the patient.
3. Collect the following in a natural conversational order:
   a. **Chief complaint** — "What brings you in today?" / "How can we help you?"
   b. **History of present illness** — onset, duration, severity, associated symptoms, aggravating/relieving factors
   c. **Past medical history** — chronic conditions, hospitalizations
   d. **Surgical history** — previous surgeries
   e. **Current medications** — name, dosage, frequency
   f. **Allergies** — medication, food, environmental; reaction and severity
   g. **Family history** — relevant hereditary conditions
   h. **Social history** — smoking, alcohol, occupation
   i. **Review of systems** — brief screening of major systems if relevant to the complaint
4. When collecting is complete, use the \`submit_preconsultation_report\` tool to save the structured data.
5. Inform the patient that the information has been shared with their doctor and what to expect next.

## Important Rules
- Always be empathetic and patient-centered.
- Use clear, simple language — avoid medical jargon unless the patient uses it first.
- If the patient describes an EMERGENCY (chest pain, difficulty breathing, severe bleeding, stroke symptoms), immediately flag urgency as "emergency" and advise them to call emergency services or go to the nearest ER.
- NEVER provide a diagnosis. You are only collecting information.
- Respect the patient's right to decline answering any question.
- Adapt your language to match the patient's locale/language preference.
- All AI suggestions are clearly labeled as "for informational purposes only".
`;

/**
 * Tool definitions for the Pre-Consultation Agent.
 * These are registered with the OpenClaw Agent runtime via medical-tools.ts.
 */
export const preConsultationTools = [
  {
    name: "submit_preconsultation_report",
    description:
      "Submit the structured pre-consultation report after collecting all patient information. " +
      "Call this once you have gathered the chief complaint, history, medications, and allergies.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string", description: "Patient UUID" },
        chiefComplaint: { type: "string", description: "Patient's main reason for visit" },
        historyOfPresentIllness: { type: "string", description: "Detailed HPI narrative" },
        pastMedicalHistory: { type: "array", items: { type: "string" }, description: "List of past medical conditions" },
        surgicalHistory: { type: "array", items: { type: "string" }, description: "List of previous surgeries" },
        medications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              dosage: { type: "string" },
              frequency: { type: "string" },
            },
            required: ["name"],
          },
        },
        allergies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              substance: { type: "string" },
              reaction: { type: "string" },
              severity: { type: "string" },
            },
            required: ["substance"],
          },
        },
        familyHistory: { type: "array", items: { type: "string" } },
        socialHistory: {
          type: "object",
          properties: {
            smoking: { type: "string" },
            alcohol: { type: "string" },
            occupation: { type: "string" },
          },
        },
        suggestedDepartment: { type: "string", description: "Recommended department based on symptoms" },
        urgencyLevel: { type: "string", enum: ["low", "moderate", "high", "emergency"] },
      },
      required: ["patientId", "chiefComplaint", "historyOfPresentIllness", "urgencyLevel"],
    },
  },
  {
    name: "suggest_department",
    description:
      "Given the patient's symptoms, suggest which hospital department would be most appropriate. " +
      "Use this during the pre-consultation to guide triage.",
    parameters: {
      type: "object",
      properties: {
        symptoms: { type: "array", items: { type: "string" }, description: "List of reported symptoms" },
        age: { type: "number", description: "Patient age" },
        gender: { type: "string", description: "Patient gender" },
      },
      required: ["symptoms"],
    },
  },
];
