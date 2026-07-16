import { Resend } from "resend";
import type { RequestRecord, Staff } from "../types.js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

export async function notifyStaffNewRequest(staff: Staff, request: RequestRecord): Promise<void> {
  const subject = `[${(request.urgency ?? "normal").toUpperCase()}] ${request.title}`;
  const body = `
New hospital request — please accept or decline in the dashboard.

Type: ${request.request_type}
Urgency: ${request.urgency}
Location: ${request.location} (Floor ${request.floor})
Summary: ${request.agent_summary ?? request.description}

Requested by: ${request.created_by_name} (${request.created_by_role})
Request ID: ${request.id}
`.trim();

  console.log(`\n📧 NOTIFY ${staff.name} <${staff.email}>`);
  console.log(`   Subject: ${subject}`);
  console.log(`   ${body.replace(/\n/g, "\n   ")}\n`);

  if (!resend) return;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: staff.email,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("[notify] email failed:", err);
  }
}

export async function notifyStaffAssigned(staff: Staff, request: RequestRecord): Promise<void> {
  const subject = `Assigned: ${request.title}`;
  const body = `You accepted request ${request.id}. Status: ${request.status}. Location: ${request.location}`;

  console.log(`\n✅ ASSIGNED ${staff.name} — ${subject}\n`);

  if (!resend) return;
  try {
    await resend.emails.send({ from: fromEmail, to: staff.email, subject, text: body });
  } catch (err) {
    console.error("[notify] email failed:", err);
  }
}

export async function notifyEligibleStaff(staffList: Staff[], request: RequestRecord): Promise<void> {
  await Promise.all(staffList.map((s) => notifyStaffNewRequest(s, request)));
}
