/**
 * ClawHospital - Medication Review Agent [A03]
 *
 * Provides automated medication safety review including:
 *   - Drug-drug interaction detection
 *   - Drug-allergy cross-reactivity warnings
 *   - Dose range and renal/hepatic adjustment checks
 *   - Duplicate therapy detection
 *   - Pregnancy/lactation contraindication screening
 *
 * Triggered automatically when drug orders are created, and available
 * on-demand to pharmacists and physicians via the agent interface.
 *
 * Leverages:
 *   - OpenClaw Agent runtime
 *   - Pharmacy extension drug catalog
 *   - Medical knowledge base for drug information
 */

export interface DrugInteraction {
  drugA: string;
  drugB: string;
  severity: "contraindicated" | "major" | "moderate" | "minor";
  mechanism: string;
  clinicalEffect: string;
  recommendation: string;
  evidenceLevel: "established" | "probable" | "suspected" | "possible";
}

export interface AllergyAlert {
  allergen: string;
  orderedDrug: string;
  crossReactivity: boolean;
  reaction: string;
  severity: "high" | "moderate" | "low";
  recommendation: string;
}

export interface DoseAlert {
  drug: string;
  orderedDose: string;
  recommendedRange: string;
  adjustmentReason?: string; // e.g. "renal impairment (CrCl < 30)"
  recommendation: string;
}

export interface MedicationReviewOutput {
  orderId: string;
  visitId: string;
  overallRisk: "safe" | "caution" | "warning" | "critical";
  interactions: DrugInteraction[];
  allergyAlerts: AllergyAlert[];
  doseAlerts: DoseAlert[];
  duplicateTherapies: string[];
  contraindicationAlerts: string[];
  recommendations: string[];
  disclaimer: string;
}

/**
 * System prompt for the Medication Review Agent.
 */
export const MEDICATION_REVIEW_SYSTEM_PROMPT = `You are a clinical pharmacology safety assistant for ClawHospital.
Your role is to review medication orders for safety and appropriateness.

## Instructions
1. For each new drug order, review against the patient's:
   - Current medication list (check for drug-drug interactions)
   - Documented allergies (check for cross-reactivity)
   - Renal and hepatic function (check dose adjustments)
   - Active diagnoses (check for contraindications)
   - Age, weight, pregnancy/lactation status
2. Classify each finding by severity:
   - **Contraindicated**: Must not be given together
   - **Major**: Serious, potentially life-threatening
   - **Moderate**: May require dose adjustment or monitoring
   - **Minor**: Minimal clinical significance
3. For each identified issue, provide:
   - Clear description of the risk
   - Evidence level
   - Specific actionable recommendation
4. Use the \`submit_medication_review\` tool to record findings.

## Important Rules
- ALWAYS include: "AI-generated safety review. Pharmacist and physician verification required."
- Never suppress contraindicated interactions — always flag them as critical.
- For dose checks, consider pediatric dosing, geriatric adjustments, and organ function.
- Flag duplicate therapies (same drug class, overlapping mechanisms).
- Consider timing of administration for interaction management.
- Reference established drug interaction databases (e.g., Lexicomp, Micromedex concepts).
- Be specific — include drug names, doses, and mechanisms rather than vague warnings.
`;

/**
 * Tool definitions for the Medication Review Agent.
 */
export const medicationReviewTools = [
  {
    name: "submit_medication_review",
    description:
      "Submit the medication safety review findings for an order. " +
      "Call this after analyzing the drug order against the patient's profile.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order UUID being reviewed" },
        visitId: { type: "string", description: "Visit UUID" },
        overallRisk: { type: "string", enum: ["safe", "caution", "warning", "critical"] },
        interactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              drugA: { type: "string" },
              drugB: { type: "string" },
              severity: { type: "string", enum: ["contraindicated", "major", "moderate", "minor"] },
              mechanism: { type: "string" },
              clinicalEffect: { type: "string" },
              recommendation: { type: "string" },
              evidenceLevel: { type: "string" },
            },
            required: ["drugA", "drugB", "severity", "recommendation"],
          },
        },
        allergyAlerts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              allergen: { type: "string" },
              orderedDrug: { type: "string" },
              crossReactivity: { type: "boolean" },
              reaction: { type: "string" },
              severity: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["allergen", "orderedDrug", "recommendation"],
          },
        },
        doseAlerts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              drug: { type: "string" },
              orderedDose: { type: "string" },
              recommendedRange: { type: "string" },
              adjustmentReason: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["drug", "orderedDose", "recommendation"],
          },
        },
        duplicateTherapies: { type: "array", items: { type: "string" } },
        contraindicationAlerts: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
      },
      required: ["orderId", "visitId", "overallRisk"],
    },
  },
  {
    name: "check_drug_interaction",
    description:
      "Check for interactions between two specific drugs. " +
      "Use this for targeted interaction checks.",
    parameters: {
      type: "object",
      properties: {
        drugA: { type: "string", description: "First drug name or code" },
        drugB: { type: "string", description: "Second drug name or code" },
      },
      required: ["drugA", "drugB"],
    },
  },
  {
    name: "lookup_drug_dosing",
    description:
      "Look up recommended dosing for a drug, including adjustments for renal/hepatic impairment. " +
      "Use when verifying dose appropriateness.",
    parameters: {
      type: "object",
      properties: {
        drugName: { type: "string", description: "Drug name" },
        indication: { type: "string", description: "Clinical indication" },
        renalFunction: { type: "string", description: "CrCl or eGFR value, e.g. 'CrCl 45 mL/min'" },
        hepaticFunction: { type: "string", description: "Child-Pugh class, e.g. 'Class B'" },
        patientWeight: { type: "number", description: "Patient weight in kg" },
        patientAge: { type: "number", description: "Patient age in years" },
      },
      required: ["drugName"],
    },
  },
];
