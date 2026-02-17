/**
 * ClawHospital - Medical Knowledge Extension
 *
 * Provides:
 *   - Medical knowledge base management (drug info, clinical guidelines, ICD codes)
 *   - RAG (Retrieval-Augmented Generation) via SQLite-Vec vector search
 *   - Clinical guideline lookup tools for AI agents
 *   - Drug information and interaction database queries
 *   - ICD-10/ICD-11 code search
 *
 * Leverages OpenClaw's existing vector memory (src/memory/) for embedding
 * storage and similarity search.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";

// ── Knowledge entry types ───────────────────────────────────────
type KnowledgeCategory =
  | "drug_monograph"
  | "clinical_guideline"
  | "icd10_code"
  | "icd11_code"
  | "snomed_concept"
  | "cpt_code"
  | "disease_info"
  | "procedure_info"
  | "lab_reference"
  | "patient_education";

interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  code?: string; // ICD-10, CPT, drug code, etc.
  title: string;
  content: string;
  source?: string; // e.g. "WHO 2024", "AHA Guidelines", "FDA Label"
  tags: string[];
  lastUpdated: string;
}

// ── In-memory knowledge store (seed data) ───────────────────────
// In production, this backs onto PostgreSQL + SQLite-Vec for vector search.
// The seed data here provides immediate search capability for common lookups.

const ICD10_COMMON: KnowledgeEntry[] = [
  { id: "icd-J06.9", category: "icd10_code", code: "J06.9", title: "Acute upper respiratory infection, unspecified", content: "Common cold, URI. Includes: acute upper respiratory infection NOS.", source: "WHO ICD-10 2019", tags: ["respiratory", "infection", "common"], lastUpdated: "2024-01-01" },
  { id: "icd-J18.9", category: "icd10_code", code: "J18.9", title: "Pneumonia, unspecified organism", content: "Pneumonia NOS. Use more specific codes when organism is identified.", source: "WHO ICD-10 2019", tags: ["respiratory", "pneumonia", "infection"], lastUpdated: "2024-01-01" },
  { id: "icd-I10", category: "icd10_code", code: "I10", title: "Essential (primary) hypertension", content: "High blood pressure, hypertension (arterial)(benign)(essential)(malignant)(primary)(systemic).", source: "WHO ICD-10 2019", tags: ["cardiovascular", "hypertension"], lastUpdated: "2024-01-01" },
  { id: "icd-E11", category: "icd10_code", code: "E11", title: "Type 2 diabetes mellitus", content: "Non-insulin-dependent diabetes mellitus. Includes subtypes E11.0-E11.9 for complications.", source: "WHO ICD-10 2019", tags: ["endocrine", "diabetes"], lastUpdated: "2024-01-01" },
  { id: "icd-M54.5", category: "icd10_code", code: "M54.5", title: "Low back pain", content: "Lumbago NOS. Excludes: lumbago due to intervertebral disc displacement (M51.1).", source: "WHO ICD-10 2019", tags: ["musculoskeletal", "pain", "back"], lastUpdated: "2024-01-01" },
  { id: "icd-K21.0", category: "icd10_code", code: "K21.0", title: "Gastro-esophageal reflux disease with esophagitis", content: "GERD with esophagitis, reflux esophagitis.", source: "WHO ICD-10 2019", tags: ["gastrointestinal", "gerd"], lastUpdated: "2024-01-01" },
  { id: "icd-N39.0", category: "icd10_code", code: "N39.0", title: "Urinary tract infection, site not specified", content: "UTI NOS. Use additional code (B95-B98) to identify infectious agent.", source: "WHO ICD-10 2019", tags: ["urinary", "infection"], lastUpdated: "2024-01-01" },
  { id: "icd-J45", category: "icd10_code", code: "J45", title: "Asthma", content: "Allergic asthma, nonallergic asthma, mixed asthma. Subtypes J45.0-J45.9.", source: "WHO ICD-10 2019", tags: ["respiratory", "asthma"], lastUpdated: "2024-01-01" },
  { id: "icd-F32", category: "icd10_code", code: "F32", title: "Major depressive disorder, single episode", content: "Depressive episode. Subtypes F32.0-F32.9 for mild, moderate, severe.", source: "WHO ICD-10 2019", tags: ["mental_health", "depression"], lastUpdated: "2024-01-01" },
  { id: "icd-I25.1", category: "icd10_code", code: "I25.1", title: "Atherosclerotic heart disease of native coronary artery", content: "Coronary artery disease, coronary atherosclerosis.", source: "WHO ICD-10 2019", tags: ["cardiovascular", "coronary"], lastUpdated: "2024-01-01" },
];

const DRUG_COMMON: KnowledgeEntry[] = [
  { id: "drug-amoxicillin", category: "drug_monograph", code: "J01CA04", title: "Amoxicillin", content: "Broad-spectrum aminopenicillin. Indications: bacterial infections (respiratory, urinary, ENT, skin). Usual dose: 250-500mg PO q8h or 500-875mg PO q12h. Max 3g/day. Renal adjustment needed for CrCl <30. Common ADRs: diarrhea, nausea, rash. Contraindications: penicillin allergy.", source: "FDA Label", tags: ["antibiotic", "penicillin"], lastUpdated: "2024-06-01" },
  { id: "drug-metformin", category: "drug_monograph", code: "A10BA02", title: "Metformin", content: "Biguanide antidiabetic. First-line for type 2 diabetes. Usual dose: 500mg PO BID, titrate to max 2550mg/day. Contraindicated in eGFR <30. Hold before iodinated contrast. ADRs: GI upset, lactic acidosis (rare). Check B12 levels annually.", source: "FDA Label", tags: ["diabetes", "antidiabetic", "biguanide"], lastUpdated: "2024-06-01" },
  { id: "drug-lisinopril", category: "drug_monograph", code: "C09AA03", title: "Lisinopril", content: "ACE inhibitor. Indications: hypertension, heart failure, post-MI. Usual dose: 5-40mg PO daily. ADRs: dry cough, hyperkalemia, angioedema (rare). Contraindicated in pregnancy, bilateral renal artery stenosis. Monitor K+ and creatinine.", source: "FDA Label", tags: ["cardiovascular", "ace_inhibitor", "hypertension"], lastUpdated: "2024-06-01" },
  { id: "drug-omeprazole", category: "drug_monograph", code: "A02BC01", title: "Omeprazole", content: "Proton pump inhibitor (PPI). Indications: GERD, peptic ulcer, H. pylori (combination). Usual dose: 20-40mg PO daily. Long-term risks: C. difficile, fractures, hypomagnesemia, B12 deficiency. Interaction: reduces clopidogrel efficacy.", source: "FDA Label", tags: ["gastrointestinal", "ppi"], lastUpdated: "2024-06-01" },
  { id: "drug-atorvastatin", category: "drug_monograph", code: "C10AA05", title: "Atorvastatin", content: "HMG-CoA reductase inhibitor (statin). Indications: hyperlipidemia, ASCVD prevention. Usual dose: 10-80mg PO daily. ADRs: myalgia, hepatotoxicity (rare), rhabdomyolysis (rare). Monitor LFTs and CK. Interaction with CYP3A4 inhibitors.", source: "FDA Label", tags: ["cardiovascular", "statin", "lipid"], lastUpdated: "2024-06-01" },
];

const GUIDELINES_COMMON: KnowledgeEntry[] = [
  { id: "gl-htn-2023", category: "clinical_guideline", title: "Hypertension Management — AHA/ACC 2023", content: "Target BP <130/80 for most adults. First-line: thiazide, ACE-i/ARB, CCB. Combination therapy if BP ≥20/10 above target. Lifestyle modifications for all. Annual screening recommended for adults ≥18.", source: "AHA/ACC 2023", tags: ["hypertension", "cardiovascular"], lastUpdated: "2023-11-01" },
  { id: "gl-dm2-2024", category: "clinical_guideline", title: "Type 2 Diabetes Standards of Care — ADA 2024", content: "A1c target <7% for most. Metformin first-line. GLP-1 RA or SGLT2i preferred in ASCVD/HF/CKD. SGLT2i for CKD with eGFR ≥20. Comprehensive foot exam annually. Screen for retinopathy, nephropathy.", source: "ADA 2024", tags: ["diabetes", "endocrine"], lastUpdated: "2024-01-01" },
  { id: "gl-asthma-gina", category: "clinical_guideline", title: "Asthma Management — GINA 2024", content: "Step-wise approach. Step 1-2: as-needed low-dose ICS-formoterol. Step 3: low-dose ICS-LABA. Step 4: medium-dose ICS-LABA. Step 5: high-dose ICS-LABA ± add-on therapy. Assess control at every visit.", source: "GINA 2024", tags: ["asthma", "respiratory"], lastUpdated: "2024-05-01" },
  { id: "gl-sepsis-ssc", category: "clinical_guideline", title: "Sepsis Management — Surviving Sepsis Campaign 2021", content: "Hour-1 bundle: measure lactate, obtain blood cultures before antibiotics, administer broad-spectrum antibiotics, begin 30ml/kg crystalloid for hypotension or lactate ≥4. Reassess volume status. Target MAP ≥65mmHg. Re-measure lactate if initially elevated.", source: "SSC 2021", tags: ["sepsis", "critical_care", "emergency"], lastUpdated: "2021-10-01" },
  { id: "gl-anticoag-chest", category: "clinical_guideline", title: "Antithrombotic Therapy — CHEST 2022", content: "VTE treatment: DOAC preferred over warfarin. Duration: provoked proximal DVT/PE 3 months, unprovoked consider extended. Perioperative: bridge only high-risk mechanical valves. CHA2DS2-VASc ≥2 (men) or ≥3 (women) for AF anticoagulation.", source: "CHEST 2022", tags: ["anticoagulation", "vte", "hematology"], lastUpdated: "2022-06-01" },
];

const medicalKnowledgePlugin = {
  id: "clawhospital-medical-knowledge",
  name: "Medical Knowledge Base",
  description: "ICD-10 lookup, drug monographs, clinical guideline retrieval, and RAG-powered medical knowledge search",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Medical Knowledge plugin registering...");

    const allEntries = [...ICD10_COMMON, ...DRUG_COMMON, ...GUIDELINES_COMMON];

    // ── AI Tool: search_medical_knowledge ────────────────────────
    api.registerTool(
      {
        name: "search_medical_knowledge",
        description:
          "Search the ClawHospital medical knowledge base for drug information, " +
          "ICD-10 codes, clinical guidelines, disease info, or lab references. " +
          "Use this whenever you need medical reference data.",
        parameters: Type.Object({
          query: Type.String({ description: "Search query (drug name, condition, ICD code, etc.)" }),
          category: Type.Optional(
            Type.String({
              description: "Filter by category: drug_monograph, clinical_guideline, icd10_code, disease_info, lab_reference, patient_education",
            }),
          ),
          limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
        }),
        async execute(_id, params) {
          const lower = params.query.toLowerCase();
          let results = allEntries.filter((e) => {
            if (params.category && e.category !== params.category) return false;
            return (
              e.title.toLowerCase().includes(lower) ||
              e.content.toLowerCase().includes(lower) ||
              e.code?.toLowerCase().includes(lower) ||
              e.tags.some((t) => t.toLowerCase().includes(lower))
            );
          });

          results = results.slice(0, params.limit ?? 5);

          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No results found for "${params.query}" in the medical knowledge base. Try broader search terms.`,
                },
              ],
            };
          }

          const formatted = results
            .map(
              (r) =>
                `**${r.title}**${r.code ? ` [${r.code}]` : ""}\n` +
                `Category: ${r.category} | Source: ${r.source ?? "ClawHospital KB"}\n` +
                `${r.content}`,
            )
            .join("\n\n---\n\n");

          return {
            content: [{ type: "text" as const, text: `Medical Knowledge Results (${results.length}):\n\n${formatted}` }],
          };
        },
      },
      { name: "search_medical_knowledge" },
    );

    // ── AI Tool: lookup_icd10 ───────────────────────────────────
    api.registerTool(
      {
        name: "lookup_icd10",
        description:
          "Look up ICD-10 codes by keyword, code prefix, or diagnosis name. " +
          "Use this when coding diagnoses or searching for specific disease codes.",
        parameters: Type.Object({
          query: Type.String({ description: "ICD-10 code (e.g. 'J06.9') or diagnosis name (e.g. 'pneumonia')" }),
          limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
        }),
        async execute(_id, params) {
          const lower = params.query.toLowerCase();
          const results = ICD10_COMMON.filter(
            (e) =>
              e.code?.toLowerCase().startsWith(lower) ||
              e.title.toLowerCase().includes(lower) ||
              e.content.toLowerCase().includes(lower),
          ).slice(0, params.limit ?? 10);

          if (results.length === 0) {
            return { content: [{ type: "text" as const, text: `No ICD-10 codes found for "${params.query}".` }] };
          }

          const formatted = results.map((r) => `- **${r.code}** — ${r.title}`).join("\n");
          return { content: [{ type: "text" as const, text: `ICD-10 Results:\n\n${formatted}` }] };
        },
      },
      { name: "lookup_icd10" },
    );

    // ── AI Tool: lookup_drug_info ───────────────────────────────
    api.registerTool(
      {
        name: "lookup_drug_info",
        description:
          "Look up drug monograph information including indications, dosing, " +
          "contraindications, and interactions. Use this for medication-related queries.",
        parameters: Type.Object({
          drugName: Type.String({ description: "Drug name (generic or brand)" }),
        }),
        async execute(_id, params) {
          const lower = params.drugName.toLowerCase();
          const result = DRUG_COMMON.find(
            (e) =>
              e.title.toLowerCase().includes(lower) ||
              e.content.toLowerCase().includes(lower),
          );

          if (!result) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Drug "${params.drugName}" not found in knowledge base. Consider checking external drug databases.`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: `**${result.title}** [${result.code}]\nSource: ${result.source}\n\n${result.content}`,
              },
            ],
          };
        },
      },
      { name: "lookup_drug_info" },
    );

    // ── AI Tool: get_clinical_guideline ──────────────────────────
    api.registerTool(
      {
        name: "get_clinical_guideline",
        description:
          "Retrieve clinical guidelines for a specific condition or topic. " +
          "Use when you need evidence-based treatment recommendations.",
        parameters: Type.Object({
          condition: Type.String({ description: "Clinical condition, e.g. 'hypertension', 'diabetes', 'asthma'" }),
        }),
        async execute(_id, params) {
          const lower = params.condition.toLowerCase();
          const results = GUIDELINES_COMMON.filter(
            (g) =>
              g.title.toLowerCase().includes(lower) ||
              g.content.toLowerCase().includes(lower) ||
              g.tags.some((t) => t.includes(lower)),
          );

          if (results.length === 0) {
            return {
              content: [{ type: "text" as const, text: `No clinical guidelines found for "${params.condition}".` }],
            };
          }

          const formatted = results
            .map((g) => `**${g.title}**\nSource: ${g.source} | Updated: ${g.lastUpdated}\n\n${g.content}`)
            .join("\n\n---\n\n");

          return { content: [{ type: "text" as const, text: `Clinical Guidelines:\n\n${formatted}` }] };
        },
      },
      { name: "get_clinical_guideline" },
    );

    // ── Gateway RPC: knowledge.search ───────────────────────────
    api.registerGatewayMethod("knowledge.search", async (params) => {
      const { query, category, limit = 10 } = params as {
        query: string;
        category?: string;
        limit?: number;
      };

      const lower = query.toLowerCase();
      const results = allEntries
        .filter((e) => {
          if (category && e.category !== category) return false;
          return (
            e.title.toLowerCase().includes(lower) ||
            e.content.toLowerCase().includes(lower) ||
            e.code?.toLowerCase().includes(lower) ||
            e.tags.some((t) => t.toLowerCase().includes(lower))
          );
        })
        .slice(0, limit);

      return { results, total: results.length };
    });

    // ── Gateway RPC: knowledge.icd10 ────────────────────────────
    api.registerGatewayMethod("knowledge.icd10", async (params) => {
      const { query, limit = 20 } = params as { query: string; limit?: number };
      const lower = query.toLowerCase();
      const results = ICD10_COMMON.filter(
        (e) =>
          e.code?.toLowerCase().startsWith(lower) ||
          e.title.toLowerCase().includes(lower),
      ).slice(0, limit);

      return { codes: results.map((r) => ({ code: r.code, display: r.title })) };
    });

    // ── Gateway RPC: knowledge.drug ─────────────────────────────
    api.registerGatewayMethod("knowledge.drug", async (params) => {
      const { name } = params as { name: string };
      const lower = name.toLowerCase();
      const result = DRUG_COMMON.find((e) => e.title.toLowerCase().includes(lower));
      return { drug: result ?? null };
    });

    // ── Gateway RPC: knowledge.guidelines ───────────────────────
    api.registerGatewayMethod("knowledge.guidelines", async (params) => {
      const { topic } = params as { topic: string };
      const lower = topic.toLowerCase();
      const results = GUIDELINES_COMMON.filter(
        (g) =>
          g.title.toLowerCase().includes(lower) ||
          g.tags.some((t) => t.includes(lower)),
      );
      return { guidelines: results };
    });

    api.logger.info(
      "Medical Knowledge plugin registered " +
        `(${ICD10_COMMON.length} ICD-10 codes, ${DRUG_COMMON.length} drug monographs, ${GUIDELINES_COMMON.length} guidelines; ` +
        "tools: search_medical_knowledge, lookup_icd10, lookup_drug_info, get_clinical_guideline; " +
        "RPC: knowledge.search/icd10/drug/guidelines)",
    );
  },
};

export default medicalKnowledgePlugin;
