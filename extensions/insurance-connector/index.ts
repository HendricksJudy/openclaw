/**
 * ClawHospital - Insurance Connector Extension
 *
 * Pluggable adapter pattern for international insurance integration.
 * Supports multiple country-specific insurance APIs:
 *   - US: Medicare / Medicaid / Commercial (HIPAA X12 837/835)
 *   - UK: NHS
 *   - EU: EHIC / Country-specific funds
 *   - International: Private medical insurance
 *
 * Each adapter implements a common interface, allowing the finance module
 * to submit claims, verify eligibility, and process remittances through
 * a unified API regardless of the target insurer.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";

// ── Common interfaces ───────────────────────────────────────────

interface EligibilityRequest {
  patientId: string;
  insuranceType: string;
  insuranceNo: string;
  serviceDate: string;
  procedureCodes?: string[]; // CPT, HCPCS, or local codes
}

interface EligibilityResponse {
  eligible: boolean;
  planName: string;
  coverageLevel: string; // in_network, out_of_network, partial
  copay?: number;
  deductible?: number;
  deductibleMet?: number;
  coinsurance?: number; // percentage
  priorAuthRequired: boolean;
  notes: string[];
}

interface ClaimSubmission {
  visitId: string;
  patientId: string;
  insuranceType: string;
  insuranceNo: string;
  diagnosisCodes: string[]; // ICD-10
  procedureCodes: Array<{ code: string; description: string; amount: number }>;
  providerNpi?: string;
  facilityCode?: string;
  totalAmount: number;
  serviceDate: string;
}

interface ClaimResponse {
  claimId: string;
  status: "submitted" | "accepted" | "rejected" | "pending_review" | "paid";
  acceptedAmount?: number;
  rejectedAmount?: number;
  adjustments: Array<{ code: string; reason: string; amount: number }>;
  paymentDate?: string;
  notes: string[];
}

// ── Insurance Adapter Interface ─────────────────────────────────

interface InsuranceAdapter {
  readonly name: string;
  readonly country: string;
  readonly supportedTypes: string[];

  checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse>;
  submitClaim(claim: ClaimSubmission): Promise<ClaimResponse>;
  checkClaimStatus(claimId: string): Promise<ClaimResponse>;
}

// ── Stub Adapters (replace with real API integrations) ──────────

class USMedicareAdapter implements InsuranceAdapter {
  readonly name = "US Medicare";
  readonly country = "US";
  readonly supportedTypes = ["medicare_a", "medicare_b", "medicare_c", "medicare_d"];

  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    // Stub: In production, this calls the CMS HETS (HIPAA Eligibility Transaction System)
    return {
      eligible: true,
      planName: "Medicare Part B",
      coverageLevel: "in_network",
      copay: 20,
      deductible: 226,
      deductibleMet: 226,
      coinsurance: 20,
      priorAuthRequired: false,
      notes: ["Medicare Part B covers 80% after deductible is met.", "Integration stub — replace with CMS HETS API."],
    };
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResponse> {
    const claimId = `MCR-${Date.now().toString(36).toUpperCase()}`;
    return {
      claimId,
      status: "submitted",
      acceptedAmount: claim.totalAmount * 0.8,
      rejectedAmount: 0,
      adjustments: [],
      notes: ["Claim submitted to Medicare fiscal intermediary.", "Integration stub — replace with X12 837P submission."],
    };
  }

  async checkClaimStatus(claimId: string): Promise<ClaimResponse> {
    return {
      claimId,
      status: "pending_review",
      adjustments: [],
      notes: ["Claim is under review.", "Integration stub."],
    };
  }
}

class USCommercialAdapter implements InsuranceAdapter {
  readonly name = "US Commercial Insurance";
  readonly country = "US";
  readonly supportedTypes = ["commercial", "ppo", "hmo", "epo", "pos"];

  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    return {
      eligible: true,
      planName: "Commercial PPO",
      coverageLevel: "in_network",
      copay: 30,
      deductible: 1500,
      deductibleMet: 750,
      coinsurance: 20,
      priorAuthRequired: false,
      notes: ["Commercial plan — verify specific benefits with payer.", "Integration stub — replace with payer-specific API."],
    };
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResponse> {
    const claimId = `COM-${Date.now().toString(36).toUpperCase()}`;
    return {
      claimId,
      status: "submitted",
      acceptedAmount: claim.totalAmount * 0.7,
      rejectedAmount: 0,
      adjustments: [],
      notes: ["Claim submitted via clearinghouse.", "Integration stub — replace with EDI 837 submission."],
    };
  }

  async checkClaimStatus(claimId: string): Promise<ClaimResponse> {
    return { claimId, status: "pending_review", adjustments: [], notes: ["Integration stub."] };
  }
}

class UKNHSAdapter implements InsuranceAdapter {
  readonly name = "UK National Health Service";
  readonly country = "UK";
  readonly supportedTypes = ["nhs"];

  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    return {
      eligible: true,
      planName: "NHS",
      coverageLevel: "in_network",
      copay: 0,
      priorAuthRequired: false,
      notes: ["NHS provides universal coverage.", "Integration stub — replace with NHS Spine API."],
    };
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResponse> {
    const claimId = `NHS-${Date.now().toString(36).toUpperCase()}`;
    return {
      claimId,
      status: "submitted",
      acceptedAmount: claim.totalAmount,
      rejectedAmount: 0,
      adjustments: [],
      notes: ["Activity submitted to NHS commissioning body.", "Integration stub."],
    };
  }

  async checkClaimStatus(claimId: string): Promise<ClaimResponse> {
    return { claimId, status: "accepted", adjustments: [], notes: ["Integration stub."] };
  }
}

class PrivateInternationalAdapter implements InsuranceAdapter {
  readonly name = "International Private Insurance";
  readonly country = "International";
  readonly supportedTypes = ["private", "international", "travel"];

  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    return {
      eligible: true,
      planName: "International Private Plan",
      coverageLevel: "in_network",
      copay: 50,
      deductible: 500,
      coinsurance: 10,
      priorAuthRequired: true,
      notes: ["Prior authorization required for inpatient admissions and advanced imaging.", "Integration stub."],
    };
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResponse> {
    const claimId = `PVT-${Date.now().toString(36).toUpperCase()}`;
    return {
      claimId,
      status: "submitted",
      acceptedAmount: claim.totalAmount * 0.9,
      rejectedAmount: 0,
      adjustments: [],
      notes: ["Claim submitted to private insurer.", "Integration stub — replace with insurer API."],
    };
  }

  async checkClaimStatus(claimId: string): Promise<ClaimResponse> {
    return { claimId, status: "pending_review", adjustments: [], notes: ["Integration stub."] };
  }
}

// ── Adapter Registry ────────────────────────────────────────────

const adapters: InsuranceAdapter[] = [
  new USMedicareAdapter(),
  new USCommercialAdapter(),
  new UKNHSAdapter(),
  new PrivateInternationalAdapter(),
];

function findAdapter(insuranceType: string): InsuranceAdapter | undefined {
  return adapters.find((a) => a.supportedTypes.includes(insuranceType.toLowerCase()));
}

// ── Plugin Definition ───────────────────────────────────────────

const insuranceConnectorPlugin = {
  id: "clawhospital-insurance-connector",
  name: "Insurance Connector",
  description: "Multi-country insurance adapter: eligibility verification, claim submission, remittance processing",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Insurance Connector plugin registering...");

    // ── AI Tool: check_insurance_eligibility ─────────────────────
    api.registerTool(
      {
        name: "check_insurance_eligibility",
        description:
          "Verify a patient's insurance eligibility and coverage for a planned service. " +
          "Use before scheduling procedures or admissions to confirm coverage.",
        parameters: Type.Object({
          patientId: Type.String({ description: "Patient UUID" }),
          insuranceType: Type.String({
            description: "Insurance type: medicare_a, medicare_b, commercial, ppo, hmo, nhs, private, international",
          }),
          insuranceNo: Type.String({ description: "Insurance member ID / policy number" }),
          serviceDate: Type.String({ description: "Planned service date YYYY-MM-DD" }),
          procedureCodes: Type.Optional(
            Type.Array(Type.String({ description: "CPT or procedure codes to verify" })),
          ),
        }),
        async execute(_id, params) {
          const adapter = findAdapter(params.insuranceType);
          if (!adapter) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No insurance adapter found for type "${params.insuranceType}". Supported types: ${adapters.flatMap((a) => a.supportedTypes).join(", ")}`,
                },
              ],
            };
          }

          const result = await adapter.checkEligibility(params);

          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Insurance Eligibility Check:\n` +
                  `- Adapter: ${adapter.name}\n` +
                  `- Plan: ${result.planName}\n` +
                  `- Eligible: ${result.eligible ? "Yes" : "No"}\n` +
                  `- Coverage: ${result.coverageLevel}\n` +
                  (result.copay != null ? `- Copay: $${result.copay}\n` : "") +
                  (result.deductible != null ? `- Deductible: $${result.deductible} (Met: $${result.deductibleMet ?? 0})\n` : "") +
                  (result.coinsurance != null ? `- Coinsurance: ${result.coinsurance}%\n` : "") +
                  `- Prior Auth Required: ${result.priorAuthRequired ? "Yes" : "No"}\n` +
                  `\nNotes: ${result.notes.join(" ")}`,
              },
            ],
          };
        },
      },
      { name: "check_insurance_eligibility" },
    );

    // ── Gateway RPC: insurance.checkEligibility ─────────────────
    api.registerGatewayMethod("insurance.checkEligibility", async (params) => {
      const req = params as EligibilityRequest;
      const adapter = findAdapter(req.insuranceType);
      if (!adapter) throw new Error(`No adapter for insurance type: ${req.insuranceType}`);
      return adapter.checkEligibility(req);
    });

    // ── Gateway RPC: insurance.submitClaim ───────────────────────
    api.registerGatewayMethod("insurance.submitClaim", async (params) => {
      const claim = params as ClaimSubmission;
      const adapter = findAdapter(claim.insuranceType);
      if (!adapter) throw new Error(`No adapter for insurance type: ${claim.insuranceType}`);
      return adapter.submitClaim(claim);
    });

    // ── Gateway RPC: insurance.claimStatus ───────────────────────
    api.registerGatewayMethod("insurance.claimStatus", async (params) => {
      const { claimId, insuranceType } = params as { claimId: string; insuranceType: string };
      const adapter = findAdapter(insuranceType);
      if (!adapter) throw new Error(`No adapter for insurance type: ${insuranceType}`);
      return adapter.checkClaimStatus(claimId);
    });

    // ── Gateway RPC: insurance.adapters ──────────────────────────
    api.registerGatewayMethod("insurance.adapters", async () => {
      return {
        adapters: adapters.map((a) => ({
          name: a.name,
          country: a.country,
          supportedTypes: a.supportedTypes,
        })),
      };
    });

    api.logger.info(
      `Insurance Connector plugin registered (${adapters.length} adapters: ${adapters.map((a) => a.name).join(", ")}; ` +
        "tools: check_insurance_eligibility; " +
        "RPC: insurance.checkEligibility/submitClaim/claimStatus/adapters)",
    );
  },
};

export default insuranceConnectorPlugin;
