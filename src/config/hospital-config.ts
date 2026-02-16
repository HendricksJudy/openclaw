/**
 * ClawHospital - Hospital Configuration Schema
 *
 * Extends the OpenClaw config system with hospital-specific settings.
 * Validated with Zod, stored in the OpenClaw config file.
 */

import { z } from "zod";

export const hospitalConfigSchema = z
  .object({
    /** Hospital identity */
    hospital: z
      .object({
        name: z.string().default("ClawHospital"),
        code: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        timezone: z.string().default("UTC"),
        locale: z.string().default("en"),
        supportedLocales: z.array(z.string()).default(["en"]),
      })
      .default({}),

    /** Database connection (can also be set via env vars) */
    database: z
      .object({
        host: z.string().default("localhost"),
        port: z.number().default(5432),
        name: z.string().default("clawhospital"),
        user: z.string().default("clawhospital"),
        poolMax: z.number().default(20),
      })
      .default({}),

    /** Module toggles — enable/disable individual HIS modules */
    modules: z
      .object({
        outpatient: z.boolean().default(true),
        inpatient: z.boolean().default(true),
        pharmacy: z.boolean().default(true),
        laboratory: z.boolean().default(true),
        examination: z.boolean().default(true),
        finance: z.boolean().default(true),
        scheduling: z.boolean().default(true),
        emr: z.boolean().default(true),
      })
      .default({}),

    /** AI agent configuration */
    ai: z
      .object({
        /** Enable AI-assisted features globally */
        enabled: z.boolean().default(true),
        /** Pre-consultation agent via messaging channels */
        preConsultation: z.boolean().default(true),
        /** AI-assisted diagnosis suggestions */
        diagnosisAssist: z.boolean().default(true),
        /** Automated medication review */
        medicationReview: z.boolean().default(true),
        /** EMR quality scoring */
        emrQuality: z.boolean().default(true),
        /** Patient service bot (appointment, follow-up) */
        patientService: z.boolean().default(true),
        /** Disclaimer text appended to all AI suggestions */
        disclaimer: z
          .string()
          .default(
            "AI-generated suggestion for reference only. Clinical decisions must be made by qualified healthcare professionals.",
          ),
      })
      .default({}),

    /** Channel mapping — which channels serve which roles */
    channels: z
      .object({
        /** Patient-facing channels for appointments, results, follow-up */
        patientChannels: z
          .array(z.string())
          .default(["whatsapp", "telegram", "web", "sms"]),
        /** Staff internal collaboration channels */
        staffChannels: z
          .array(z.string())
          .default(["slack", "discord", "teams"]),
        /** Channels for critical alerts (critical lab values, emergencies) */
        alertChannels: z
          .array(z.string())
          .default(["whatsapp", "telegram", "sms", "slack"]),
      })
      .default({}),

    /** Security settings */
    security: z
      .object({
        /** Maximum failed login attempts before lockout */
        maxLoginAttempts: z.number().default(5),
        /** Account lockout duration in minutes */
        lockoutDurationMinutes: z.number().default(15),
        /** Require password change interval in days (0 = disabled) */
        passwordRotationDays: z.number().default(90),
        /** Enable PII field-level encryption */
        encryptPii: z.boolean().default(true),
        /** Session timeout in minutes */
        sessionTimeoutMinutes: z.number().default(60),
      })
      .default({}),

    /** Insurance/billing connector configuration */
    insurance: z
      .object({
        /** Active insurance connectors */
        connectors: z.array(z.string()).default([]),
        /** Default currency code */
        currency: z.string().default("USD"),
      })
      .default({}),
  })
  .default({});

export type HospitalConfig = z.infer<typeof hospitalConfigSchema>;

/**
 * Load hospital config from the OpenClaw config object.
 */
export function loadHospitalConfig(rawConfig?: unknown): HospitalConfig {
  const parsed = hospitalConfigSchema.safeParse(rawConfig ?? {});
  if (!parsed.success) {
    console.warn(
      "[clawhospital:config] Invalid hospital config, using defaults:",
      parsed.error.issues,
    );
    return hospitalConfigSchema.parse({});
  }
  return parsed.data;
}
