/**
 * ClawHospital - Email Channel Plugin (Skeleton)
 *
 * Provides email notifications for:
 *   - Lab/imaging report delivery
 *   - Billing statements
 *   - Appointment confirmations
 *   - Follow-up reminders
 *   - Discharge summaries
 *
 * Supports SendGrid and SMTP as backend providers.
 * Full implementation to be completed in Phase 4.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type EmailConfig = {
  provider: "sendgrid" | "smtp";
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  fromEmail: string;
  fromName?: string;
};

const emailChannelPlugin = {
  id: "clawhospital-channel-email",
  name: "Email Channel",
  description: "Email notifications for reports, bills, and follow-up",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    const config = api.pluginConfig as EmailConfig | undefined;

    if (!config?.provider) {
      api.logger.info("Email Channel: No provider configured, skipping registration");
      return;
    }

    api.logger.info(`Email Channel registering with provider: ${config.provider}`);

    // Register a tool for sending emails from agents
    api.registerTool(
      {
        name: "send_email",
        description:
          "Send an email to a patient or staff member. Use for sending reports, " +
          "billing statements, appointment confirmations, or discharge summaries.",
        parameters: {
          type: "object" as const,
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject line" },
            body: { type: "string", description: "Email body (supports markdown)" },
          },
          required: ["to", "subject", "body"],
        },
        async execute(_id: string, params: { to: string; subject: string; body: string }) {
          // TODO: Phase 4 — implement actual email sending
          api.logger.info(`[Email Tool] Queued email to ${params.to}: ${params.subject}`);
          return {
            content: [
              {
                type: "text" as const,
                text: `Email queued for delivery to ${params.to} (subject: ${params.subject})`,
              },
            ],
          };
        },
      },
      { name: "send_email", optional: true },
    );

    api.logger.info("Email Channel plugin registered");
  },
};

export default emailChannelPlugin;
