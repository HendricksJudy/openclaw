/**
 * ClawHospital - Patient Service Agent [A05]
 *
 * Serves as the patient-facing AI assistant across all OpenClaw channels.
 * Handles:
 *   - Conversational appointment booking
 *   - Lab/exam result inquiry and delivery
 *   - Medication reminders (via Cron + multi-channel push)
 *   - Post-discharge follow-up conversations
 *   - Health education and FAQ
 *   - Bill and insurance inquiry
 *
 * Leverages:
 *   - OpenClaw multi-channel messaging (WhatsApp, Telegram, SMS, Web, etc.)
 *   - OpenClaw Cron for scheduled reminders
 *   - OpenClaw session management for persistent patient conversations
 */

export interface FollowUpPlan {
  patientId: string;
  visitId: string;
  scheduleType: "medication_reminder" | "appointment_reminder" | "follow_up_call" | "health_education" | "survey";
  channel: string; // whatsapp, telegram, sms, email, web
  cronPattern: string; // e.g. "0 8 * * *" for daily at 8am
  message: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
}

export interface PatientInquiryResult {
  type: "appointment" | "lab_result" | "medication" | "bill" | "general";
  data: Record<string, unknown>;
  message: string;
}

/**
 * System prompt for the Patient Service Agent.
 */
export const PATIENT_SERVICE_SYSTEM_PROMPT = `You are ClawHospital's patient service assistant, available across all messaging channels.
Your role is to help patients with appointment management, health inquiries, and care coordination.

## Capabilities
1. **Appointment Management**
   - Help patients book, reschedule, or cancel appointments
   - Provide information about available doctors and departments
   - Send appointment reminders
   - Handle walk-in queue information

2. **Results & Reports**
   - Help patients check the status of lab tests and imaging
   - Deliver results when authorized by the ordering physician
   - Explain results in simple, patient-friendly language
   - Flag when results need urgent physician follow-up

3. **Medication Support**
   - Set up and manage medication reminders
   - Provide basic medication information (purpose, common side effects)
   - Remind about prescription refills
   - NEVER change medication dosages or recommend medications

4. **Post-Discharge Follow-Up**
   - Conduct automated follow-up conversations after discharge
   - Check on recovery progress
   - Screen for complications or red flags
   - Schedule follow-up appointments when needed

5. **Billing & Insurance**
   - Help patients check outstanding balances
   - Explain charges in simple terms
   - Guide patients to the finance department for complex inquiries

6. **Health Education**
   - Provide disease-specific health education materials
   - Share preventive care guidelines
   - Remind about recommended screenings

## Important Rules
- ALWAYS verify patient identity before sharing any medical information.
- NEVER provide diagnoses, change treatment plans, or recommend medications.
- For emergencies, immediately advise calling emergency services.
- Use simple, clear language appropriate for the patient's language preference.
- Respect cultural sensitivities and patient autonomy.
- All health information shared is "for educational purposes only."
- Route complex clinical questions to the appropriate healthcare provider.
- Be warm, empathetic, and professional at all times.
- Respect message channel limitations (e.g., SMS has character limits).
`;

/**
 * Tool definitions for the Patient Service Agent.
 */
export const patientServiceTools = [
  {
    name: "book_patient_appointment",
    description:
      "Book an appointment for the patient. Collects preference and finds available slots.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string" },
        departmentId: { type: "string" },
        doctorId: { type: "string" },
        preferredDate: { type: "string", description: "YYYY-MM-DD" },
        preferredTime: { type: "string", description: "HH:MM" },
        appointmentType: { type: "string", enum: ["first_visit", "follow_up", "consultation"] },
        chiefComplaint: { type: "string" },
        channel: { type: "string", description: "Booking channel identifier" },
      },
      required: ["patientId", "departmentId", "preferredDate"],
    },
  },
  {
    name: "check_lab_results",
    description:
      "Check the status and results of lab tests for a patient. " +
      "Only returns results that have been authorized for patient viewing.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string" },
        testType: { type: "string", description: "Specific test name or 'all'" },
        dateRange: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
          },
        },
      },
      required: ["patientId"],
    },
  },
  {
    name: "setup_medication_reminder",
    description:
      "Set up a recurring medication reminder for the patient via their preferred channel.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string" },
        medicationName: { type: "string" },
        dosage: { type: "string" },
        frequency: { type: "string", description: "daily, twice_daily, three_times_daily, weekly" },
        reminderTimes: { type: "array", items: { type: "string" }, description: "Array of HH:MM times" },
        channel: { type: "string", description: "whatsapp, telegram, sms" },
        startDate: { type: "string" },
        endDate: { type: "string" },
      },
      required: ["patientId", "medicationName", "frequency", "reminderTimes", "channel"],
    },
  },
  {
    name: "conduct_follow_up",
    description:
      "Initiate or continue a post-discharge follow-up conversation with the patient.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string" },
        visitId: { type: "string" },
        followUpType: { type: "string", enum: ["recovery_check", "symptom_screening", "satisfaction_survey", "appointment_scheduling"] },
        daysPostDischarge: { type: "number" },
      },
      required: ["patientId", "visitId", "followUpType"],
    },
  },
  {
    name: "check_patient_balance",
    description:
      "Check outstanding balance and recent charges for a patient.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string" },
      },
      required: ["patientId"],
    },
  },
  {
    name: "verify_patient_identity",
    description:
      "Verify patient identity before sharing sensitive information. " +
      "Requires at least two matching identifiers.",
    parameters: {
      type: "object",
      properties: {
        patientId: { type: "string" },
        verificationMethod: { type: "string", enum: ["dob_and_name", "mrn_and_dob", "phone_and_name"] },
        identifiers: {
          type: "object",
          properties: {
            name: { type: "string" },
            dateOfBirth: { type: "string" },
            medicalRecordNo: { type: "string" },
            phone: { type: "string" },
          },
        },
      },
      required: ["verificationMethod", "identifiers"],
    },
  },
];
