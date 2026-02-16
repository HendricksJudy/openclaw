/**
 * ClawHospital - SMS Channel Plugin (Skeleton)
 *
 * Provides SMS messaging for patient notifications:
 *   - Appointment reminders
 *   - Lab result notifications
 *   - Critical value alerts
 *   - Prescription ready alerts
 *
 * Supports Twilio and Vonage as backend providers.
 * Full implementation to be completed in Phase 4.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type SmsConfig = {
  provider: "twilio" | "vonage";
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

const smsChannelPlugin = {
  id: "clawhospital-channel-sms",
  name: "SMS Channel",
  description: "SMS messaging channel for patient notifications",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    const config = api.pluginConfig as SmsConfig | undefined;

    if (!config?.provider) {
      api.logger.info("SMS Channel: No provider configured, skipping registration");
      return;
    }

    api.logger.info(`SMS Channel registering with provider: ${config.provider}`);

    // Register the SMS channel
    api.registerChannel({
      id: "sms",
      label: "SMS",
      description: "SMS messaging via " + config.provider,

      async sendMessage(to: string, content: string) {
        // TODO: Phase 4 — implement actual SMS sending
        api.logger.info(`[SMS] Would send to ${to}: ${content.slice(0, 50)}...`);
      },
    } as any); // Cast needed until full channel interface is implemented

    // Register a tool for sending SMS from agents
    api.registerTool(
      {
        name: "send_sms",
        description:
          "Send an SMS message to a patient. Use for appointment reminders, " +
          "lab result notifications, or other time-sensitive communications.",
        parameters: {
          type: "object" as const,
          properties: {
            to: { type: "string", description: "Recipient phone number (E.164 format)" },
            message: { type: "string", description: "SMS message text (max 160 chars recommended)" },
          },
          required: ["to", "message"],
        },
        async execute(_id: string, params: { to: string; message: string }) {
          // TODO: Phase 4 — implement actual sending
          api.logger.info(`[SMS Tool] Queued message to ${params.to}`);
          return {
            content: [
              {
                type: "text" as const,
                text: `SMS queued for delivery to ${params.to}`,
              },
            ],
          };
        },
      },
      { name: "send_sms", optional: true },
    );

    api.logger.info("SMS Channel plugin registered");
  },
};

export default smsChannelPlugin;
