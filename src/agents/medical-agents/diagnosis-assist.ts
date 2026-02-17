/**
 * ClawHospital - Diagnosis Assist Agent [A02]
 *
 * Provides differential diagnosis suggestions, clinical pathway recommendations,
 * and ICD-10/ICD-11 coding assistance to physicians.
 *
 * Operates within the doctor workstation context — receives structured clinical
 * data (symptoms, vitals, lab results, exam findings) and returns ranked
 * differential diagnoses with supporting evidence and recommended next steps.
 *
 * Leverages:
 *   - OpenClaw Agent runtime (pi-embedded-runner)
 *   - Medical knowledge base (RAG via SQLite-Vec)
 *   - Clinical guideline skills
 */

export interface DiagnosisSuggestion {
  rank: number;
  diagnosisCode: string; // ICD-10 code
  codeSystem: "ICD-10" | "ICD-11" | "SNOMED";
  displayName: string;
  confidence: "high" | "moderate" | "low";
  supportingEvidence: string[];
  suggestedWorkup: string[]; // recommended tests/exams
  clinicalPathway?: string;
  redFlags: string[];
}

export interface DiagnosisAssistOutput {
  visitId: string;
  differentials: DiagnosisSuggestion[];
  reasoning: string;
  disclaimer: string;
}

/**
 * System prompt for the Diagnosis Assist Agent.
 */
export const DIAGNOSIS_ASSIST_SYSTEM_PROMPT = `You are a clinical decision support assistant for ClawHospital physicians.
Your role is to provide differential diagnosis suggestions based on clinical data.

## Instructions
1. Analyze the provided clinical information:
   - Chief complaint and history of present illness
   - Vital signs and physical examination findings
   - Laboratory results
   - Imaging/examination findings
   - Past medical history, medications, allergies
2. Generate a ranked list of differential diagnoses with:
   - ICD-10 code and display name
   - Confidence level (high/moderate/low)
   - Supporting evidence from the clinical data
   - Suggested additional workup for confirmation
   - Relevant clinical pathways or guidelines
   - Red flags that require immediate attention
3. Use the \`submit_differential_diagnosis\` tool to record your analysis.

## Important Rules
- ALWAYS include the disclaimer: "AI-generated suggestions for physician reference only. Does not replace clinical judgment."
- Rank differentials by clinical probability based on available evidence.
- Highlight any life-threatening conditions ("cannot miss" diagnoses) even if low probability.
- Reference clinical guidelines where applicable (e.g., AHA, NICE, WHO).
- Suggest the minimum necessary workup — avoid excessive testing.
- Be specific with ICD-10 codes — prefer specific codes over unspecified ones.
- Consider patient demographics (age, gender) in your differential.
- Flag drug-disease interactions if the patient's medication list is available.
`;

/**
 * Tool definitions for the Diagnosis Assist Agent.
 */
export const diagnosisAssistTools = [
  {
    name: "submit_differential_diagnosis",
    description:
      "Submit the differential diagnosis list and clinical reasoning for a patient visit. " +
      "Call this after analyzing the clinical data.",
    parameters: {
      type: "object",
      properties: {
        visitId: { type: "string", description: "Visit UUID" },
        differentials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rank: { type: "number" },
              diagnosisCode: { type: "string", description: "ICD-10 code" },
              codeSystem: { type: "string", enum: ["ICD-10", "ICD-11", "SNOMED"] },
              displayName: { type: "string" },
              confidence: { type: "string", enum: ["high", "moderate", "low"] },
              supportingEvidence: { type: "array", items: { type: "string" } },
              suggestedWorkup: { type: "array", items: { type: "string" } },
              clinicalPathway: { type: "string" },
              redFlags: { type: "array", items: { type: "string" } },
            },
            required: ["rank", "diagnosisCode", "displayName", "confidence"],
          },
        },
        reasoning: { type: "string", description: "Narrative clinical reasoning" },
      },
      required: ["visitId", "differentials", "reasoning"],
    },
  },
  {
    name: "lookup_icd10_code",
    description:
      "Look up ICD-10 codes by keyword or description. " +
      "Use when you need to find the correct ICD-10 code for a diagnosis.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Diagnosis name or keyword to search" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "query_clinical_guidelines",
    description:
      "Retrieve relevant clinical guidelines or protocols for a given condition. " +
      "Use when you want to reference evidence-based guidelines.",
    parameters: {
      type: "object",
      properties: {
        condition: { type: "string", description: "Clinical condition or topic" },
        source: { type: "string", description: "Guideline source: AHA, NICE, WHO, IDSA, etc." },
      },
      required: ["condition"],
    },
  },
];
