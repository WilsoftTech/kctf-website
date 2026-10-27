// Staff notification for a saved enquiry. Visitor input appears only in the bodies:
// HTML-escaped in the HTML part, never in the subject or sender. The visitor's address
// is the Reply-To; the sender is always the verified ENQUIRY_FROM mailbox.
import type { DeliveryConfig } from "@/server/config";
import type { EnquiryTopic } from "@/validation/enquiry";

export const STAFF_NOTIFICATION = "staff-notification";

export type NotificationEnquiry = {
  id: string;
  name: string;
  email: string;
  topic: EnquiryTopic;
  message: string;
  createdAt: Date;
};

const topicLabels = {
  general: "General",
  volunteer: "Volunteering",
  partnership: "Partnership",
  donation: "Donation",
} as const satisfies Record<EnquiryTopic, string>;

// Donations cannot be paid through the website; staff must not read the enquiry as a gift.
const donationNote =
  "This is an enquiry about donating. No payment was requested or taken by the website.";

export function enquiryReference(id: string) {
  return `KCTF-${id.replace(/-/g, "").slice(-8).toUpperCase()}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildStaffNotification(
  enquiry: NotificationEnquiry,
  delivery: Pick<DeliveryConfig, "from" | "to">,
) {
  const reference = enquiryReference(enquiry.id);
  const topic = topicLabels[enquiry.topic];
  const received = enquiry.createdAt.toISOString().replace(".000Z", "Z");
  const text = [
    `New ${topic.toLowerCase()} enquiry from the KCTF website.`,
    "",
    `Reference: ${reference}`,
    `Received: ${received}`,
    `Topic: ${topic}`,
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    "",
    ...(enquiry.topic === "donation" ? [donationNote, ""] : []),
    enquiry.message,
    "",
    "The visitor acknowledged the website privacy notice.",
    "Reply to this email to respond to the visitor directly.",
  ].join("\n");
  const row = (label: string, value: string) =>
    `<tr><th align="left" style="padding:4px 12px 4px 0">${label}</th><td>${escapeHtml(value)}</td></tr>`;
  const html = [
    `<p>New ${topic.toLowerCase()} enquiry from the KCTF website.</p>`,
    `<table role="presentation">`,
    row("Reference", reference),
    row("Received", received),
    row("Topic", topic),
    row("Name", enquiry.name),
    row("Email", enquiry.email),
    `</table>`,
    ...(enquiry.topic === "donation" ? [`<p>${donationNote}</p>`] : []),
    `<p style="white-space:pre-wrap">${escapeHtml(enquiry.message)}</p>`,
    `<p>The visitor acknowledged the website privacy notice. Reply to this email to respond to the visitor directly.</p>`,
  ].join("\n");
  return {
    from: delivery.from,
    to: delivery.to,
    reply_to: enquiry.email,
    subject: `KCTF website enquiry: ${topic} (${reference})`,
    text,
    html,
  };
}
