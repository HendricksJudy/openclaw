/**
 * ClawHospital - Patient Management Extension Plugin
 *
 * Provides:
 *   - AI Tool: patient_search (agents can look up patients)
 *   - AI Tool: patient_register (agents can register patients via chat)
 *   - HTTP Routes: REST API for patient CRUD
 *   - Gateway Method: patient.search (RPC)
 *
 * This is the first medical business module — the template for all others.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import { patients, type NewPatient } from "../../src/db/schema/patients.ts";
import { eq, ilike, or, sql } from "drizzle-orm";

const patientManagementPlugin = {
  id: "clawhospital-patient-management",
  name: "Patient Management",
  description: "Patient registration, search, MPI, and demographics management",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Patient Management plugin registering...");

    // ── AI Tool: patient_search ──────────────────────────────
    api.registerTool(
      {
        name: "patient_search",
        description:
          "Search for a patient by name, medical record number, phone, or insurance number. " +
          "Returns matching patient records. Use this when a healthcare provider asks to look up a patient.",
        parameters: Type.Object({
          query: Type.String({
            description:
              "Search query — can be patient name, MRN, phone number, or insurance number",
          }),
          limit: Type.Optional(
            Type.Number({ description: "Max results to return", default: 10 }),
          ),
        }),
        async execute(_id, params) {
          const db = getDb();
          const q = `%${params.query}%`;
          const maxResults = params.limit ?? 10;

          const results = await db
            .select({
              id: patients.id,
              medicalRecordNo: patients.medicalRecordNo,
              name: patients.name,
              gender: patients.gender,
              birthDate: patients.birthDate,
              phone: patients.phone,
              insuranceType: patients.insuranceType,
            })
            .from(patients)
            .where(
              or(
                ilike(patients.name, q),
                ilike(patients.medicalRecordNo, q),
                ilike(patients.phone, q),
                ilike(patients.insuranceNo, q),
              ),
            )
            .limit(maxResults);

          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No patients found matching "${params.query}".`,
                },
              ],
            };
          }

          const formatted = results
            .map(
              (p) =>
                `- **${p.name}** (MRN: ${p.medicalRecordNo}) | Gender: ${p.gender === 1 ? "M" : p.gender === 2 ? "F" : "Other"} | DOB: ${p.birthDate} | Phone: ${p.phone ?? "N/A"}`,
            )
            .join("\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Found ${results.length} patient(s):\n\n${formatted}`,
              },
            ],
          };
        },
      },
      { name: "patient_search" },
    );

    // ── AI Tool: patient_register ────────────────────────────
    api.registerTool(
      {
        name: "patient_register",
        description:
          "Register a new patient in the hospital system. " +
          "Collects name, gender, date of birth, and contact details. " +
          "Use this when a new patient needs to be added to the system.",
        parameters: Type.Object({
          name: Type.String({ description: "Patient full name" }),
          gender: Type.Number({
            description: "1=Male, 2=Female, 3=Other",
          }),
          birthDate: Type.String({
            description: "Date of birth in YYYY-MM-DD format",
          }),
          phone: Type.Optional(Type.String({ description: "Phone number" })),
          email: Type.Optional(Type.String({ description: "Email address" })),
          insuranceType: Type.Optional(
            Type.String({ description: "Insurance type: private, medicare, medicaid, nhs, etc." }),
          ),
          insuranceNo: Type.Optional(
            Type.String({ description: "Insurance number" }),
          ),
        }),
        async execute(_id, params) {
          const db = getDb();

          // Generate MRN: CH + timestamp + random suffix
          const mrn = `CH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

          const newPatient: NewPatient = {
            medicalRecordNo: mrn,
            name: params.name,
            gender: params.gender,
            birthDate: params.birthDate,
            phone: params.phone,
            email: params.email,
            insuranceType: params.insuranceType,
            insuranceNo: params.insuranceNo,
          };

          const [created] = await db
            .insert(patients)
            .values(newPatient)
            .returning();

          return {
            content: [
              {
                type: "text" as const,
                text: `Patient registered successfully:\n- Name: ${created!.name}\n- MRN: ${created!.medicalRecordNo}\n- ID: ${created!.id}`,
              },
            ],
          };
        },
      },
      { name: "patient_register" },
    );

    // ── Gateway RPC Method: patient.search ───────────────────
    api.registerGatewayMethod("patient.search", async (params) => {
      const db = getDb();
      const { query, limit = 20 } = params as { query: string; limit?: number };

      const q = `%${query}%`;
      const results = await db
        .select()
        .from(patients)
        .where(
          or(
            ilike(patients.name, q),
            ilike(patients.medicalRecordNo, q),
            ilike(patients.phone, q),
          ),
        )
        .limit(limit);

      return { patients: results };
    });

    // ── Gateway RPC Method: patient.get ──────────────────────
    api.registerGatewayMethod("patient.get", async (params) => {
      const db = getDb();
      const { id } = params as { id: string };

      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);

      if (!patient) {
        throw new Error(`Patient not found: ${id}`);
      }

      return { patient };
    });

    // ── Gateway RPC Method: patient.create ───────────────────
    api.registerGatewayMethod("patient.create", async (params) => {
      const db = getDb();
      const data = params as NewPatient;

      if (!data.medicalRecordNo) {
        data.medicalRecordNo = `CH${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }

      const [created] = await db.insert(patients).values(data).returning();
      return { patient: created };
    });

    api.logger.info(
      "Patient Management plugin registered (tools: patient_search, patient_register; RPC: patient.search, patient.get, patient.create)",
    );
  },
};

export default patientManagementPlugin;
