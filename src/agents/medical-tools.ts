/**
 * ClawHospital - Medical Tools Registry
 *
 * Central registration point for all medical AI agent tools.
 * This module aggregates tool definitions from all medical agents
 * and provides a unified interface for the OpenClaw Agent runtime
 * to discover and load medical-domain tools.
 *
 * Each agent's tools are imported and re-exported here so the
 * pi-embedded-runner can register them via a single import.
 */

import {
  preConsultationTools,
  PRE_CONSULTATION_SYSTEM_PROMPT,
} from "./medical-agents/pre-consultation.ts";
import {
  diagnosisAssistTools,
  DIAGNOSIS_ASSIST_SYSTEM_PROMPT,
} from "./medical-agents/diagnosis-assist.ts";
import {
  medicationReviewTools,
  MEDICATION_REVIEW_SYSTEM_PROMPT,
} from "./medical-agents/medication-review.ts";
import {
  emrQualityTools,
  EMR_QUALITY_SYSTEM_PROMPT,
} from "./medical-agents/emr-quality.ts";
import {
  patientServiceTools,
  PATIENT_SERVICE_SYSTEM_PROMPT,
} from "./medical-agents/patient-service.ts";

// ── Agent Definitions ─────────────────────────────────────────────

export interface MedicalAgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  triggerPatterns?: string[]; // message patterns that auto-activate this agent
  requiredRoles?: string[]; // RBAC roles allowed to invoke this agent
}

/**
 * All medical agent definitions, keyed by agent ID.
 */
export const MEDICAL_AGENTS: Record<string, MedicalAgentDefinition> = {
  "pre-consultation": {
    id: "pre-consultation",
    name: "Pre-Consultation Agent",
    description:
      "Conversational pre-visit data collector — gathers patient history via any channel before the doctor visit.",
    systemPrompt: PRE_CONSULTATION_SYSTEM_PROMPT,
    tools: preConsultationTools,
    triggerPatterns: [
      "I'd like to see a doctor",
      "I need an appointment",
      "I'm not feeling well",
      "pre-consultation",
      "pre-visit",
    ],
    requiredRoles: undefined, // available to patients (no role restriction)
  },

  "diagnosis-assist": {
    id: "diagnosis-assist",
    name: "Diagnosis Assist Agent",
    description:
      "Clinical decision support — provides differential diagnosis suggestions, ICD-10 coding, and guideline references.",
    systemPrompt: DIAGNOSIS_ASSIST_SYSTEM_PROMPT,
    tools: diagnosisAssistTools,
    requiredRoles: ["physician", "superadmin"],
  },

  "medication-review": {
    id: "medication-review",
    name: "Medication Review Agent",
    description:
      "Medication safety review — checks drug interactions, allergy cross-reactivity, dose appropriateness, and duplicate therapy.",
    systemPrompt: MEDICATION_REVIEW_SYSTEM_PROMPT,
    tools: medicationReviewTools,
    requiredRoles: ["physician", "pharmacist", "superadmin"],
  },

  "emr-quality": {
    id: "emr-quality",
    name: "EMR Quality Control Agent",
    description:
      "Clinical document quality review — checks completeness, consistency, timeliness, coding accuracy, and compliance.",
    systemPrompt: EMR_QUALITY_SYSTEM_PROMPT,
    tools: emrQualityTools,
    requiredRoles: ["physician", "admin", "superadmin"],
  },

  "patient-service": {
    id: "patient-service",
    name: "Patient Service Agent",
    description:
      "Patient-facing assistant — handles appointments, result inquiries, medication reminders, follow-ups, and billing questions.",
    systemPrompt: PATIENT_SERVICE_SYSTEM_PROMPT,
    tools: patientServiceTools,
    triggerPatterns: [
      "book appointment",
      "check results",
      "my lab results",
      "medication reminder",
      "my bill",
      "follow up",
    ],
    requiredRoles: undefined, // available to patients
  },
};

/**
 * Get all tools across all medical agents as a flat array.
 * Useful for bulk registration with the agent runtime.
 */
export function getAllMedicalTools() {
  return Object.values(MEDICAL_AGENTS).flatMap((agent) =>
    agent.tools.map((tool) => ({
      ...tool,
      agentId: agent.id,
    })),
  );
}

/**
 * Get agent definition by ID.
 */
export function getMedicalAgent(agentId: string): MedicalAgentDefinition | undefined {
  return MEDICAL_AGENTS[agentId];
}

/**
 * Get agent IDs available to a given role.
 */
export function getAgentsForRole(roleCode: string): MedicalAgentDefinition[] {
  return Object.values(MEDICAL_AGENTS).filter(
    (agent) => !agent.requiredRoles || agent.requiredRoles.includes(roleCode),
  );
}

/**
 * Try to match an incoming message to a medical agent by trigger patterns.
 * Returns the best-matching agent ID or undefined if no match.
 */
export function matchAgentByMessage(message: string): string | undefined {
  const lower = message.toLowerCase();
  for (const [agentId, agent] of Object.entries(MEDICAL_AGENTS)) {
    if (agent.triggerPatterns?.some((p) => lower.includes(p.toLowerCase()))) {
      return agentId;
    }
  }
  return undefined;
}
