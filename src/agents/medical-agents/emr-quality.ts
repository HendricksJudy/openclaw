/**
 * ClawHospital - EMR Quality Control Agent [A04]
 *
 * Performs automated quality assessment of electronic medical record documents,
 * checking for completeness, consistency, timeliness, and compliance with
 * clinical documentation standards.
 *
 * Can be triggered:
 *   - On-demand by physicians/quality officers
 *   - Automatically via cron jobs (batch quality review)
 *   - At document signing time (pre-sign validation)
 *
 * Leverages:
 *   - OpenClaw Agent runtime
 *   - EMR extension document data
 *   - OpenClaw Cron for scheduled reviews
 */

export interface QualityIssue {
  code: string;
  severity: "critical" | "major" | "minor" | "info";
  category: "completeness" | "consistency" | "timeliness" | "coding" | "compliance";
  field?: string;
  message: string;
  suggestion?: string;
}

export interface QualityReport {
  documentId: string;
  visitId: string;
  docType: string;
  overallScore: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  issues: QualityIssue[];
  strengths: string[];
  improvementAreas: string[];
  complianceStatus: "compliant" | "needs_improvement" | "non_compliant";
  reviewedAt: string;
  disclaimer: string;
}

/**
 * System prompt for the EMR Quality Control Agent.
 */
export const EMR_QUALITY_SYSTEM_PROMPT = `You are an EMR quality control specialist for ClawHospital.
Your role is to review clinical documents for quality, completeness, and compliance.

## Quality Dimensions
1. **Completeness** — Are all required sections present and adequately documented?
   - Chief complaint, HPI, physical exam, assessment, plan
   - Medication reconciliation
   - Allergies documented
   - Informed consent (when applicable)
2. **Consistency** — Do findings support the documented diagnoses?
   - Diagnosis matches symptoms and exam findings
   - Ordered tests align with clinical reasoning
   - Medication dosages consistent with diagnoses
3. **Timeliness** — Are documents created and signed within policy deadlines?
   - H&P within 24 hours of admission
   - Progress notes daily for inpatients
   - Discharge summary within 48 hours of discharge
   - Operative notes within 24 hours of surgery
4. **Coding Accuracy** — Are ICD-10 codes specific and correct?
   - Avoid unspecified codes when specificity is available
   - Codes match documented conditions
   - All active conditions coded
5. **Compliance** — Does the document meet regulatory requirements?
   - HIPAA-compliant language
   - Required signatures present
   - Informed consent documented when needed

## Scoring
- Each critical issue: -20 points
- Each major issue: -10 points
- Each minor issue: -5 points
- Each info notice: -1 point
- Base score: 100
- Grade: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)

## Instructions
1. Analyze the provided EMR document against all quality dimensions.
2. Identify specific issues with clear codes, categories, and suggestions.
3. Note document strengths — what was done well.
4. Use the \`submit_quality_report\` tool to record findings.

## Important Rules
- Be constructive — suggest improvements rather than just flagging issues.
- Reference specific sections and content when citing issues.
- NEVER modify the clinical content — you are reviewing, not authoring.
- Include: "AI-generated quality review. Subject to human quality officer approval."
`;

/**
 * Tool definitions for the EMR Quality Control Agent.
 */
export const emrQualityTools = [
  {
    name: "submit_quality_report",
    description:
      "Submit the EMR quality assessment report for a clinical document. " +
      "Call this after completing your review of the document.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "EMR document UUID" },
        visitId: { type: "string", description: "Visit UUID" },
        docType: { type: "string", description: "Document type" },
        overallScore: { type: "number", description: "Quality score 0-100" },
        grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Issue code, e.g. QC001" },
              severity: { type: "string", enum: ["critical", "major", "minor", "info"] },
              category: { type: "string", enum: ["completeness", "consistency", "timeliness", "coding", "compliance"] },
              field: { type: "string" },
              message: { type: "string" },
              suggestion: { type: "string" },
            },
            required: ["code", "severity", "category", "message"],
          },
        },
        strengths: { type: "array", items: { type: "string" } },
        improvementAreas: { type: "array", items: { type: "string" } },
        complianceStatus: { type: "string", enum: ["compliant", "needs_improvement", "non_compliant"] },
      },
      required: ["documentId", "visitId", "overallScore", "grade", "issues", "complianceStatus"],
    },
  },
  {
    name: "fetch_document_for_review",
    description:
      "Retrieve the full EMR document content for quality review. " +
      "Use this to load the document before performing quality analysis.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "EMR document UUID" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "check_timeliness",
    description:
      "Check whether a document was created/signed within the required timeframe. " +
      "Use this to verify timeliness compliance.",
    parameters: {
      type: "object",
      properties: {
        docType: { type: "string" },
        documentCreatedAt: { type: "string", description: "ISO timestamp of document creation" },
        visitAdmissionDate: { type: "string", description: "ISO timestamp of admission" },
        visitDischargeDate: { type: "string", description: "ISO timestamp of discharge (if applicable)" },
        signedAt: { type: "string", description: "ISO timestamp of signing (if signed)" },
      },
      required: ["docType", "documentCreatedAt"],
    },
  },
];
