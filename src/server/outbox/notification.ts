// Staff notification for a saved enquiry. Visitor input appears only in the bodies:
// HTML-escaped in the HTML part, never in the subject or sender. The visitor's address
// is the Reply-To; the sender is always the verified ENQUIRY_FROM mailbox.
import type { DeliveryConfig } from "@/server/config";
import type { EnquiryTopic } from "@/validation/enquiry";
import { currencyRules, isDonationCurrency } from "@/lib/donation-options";

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

// ── Online donations ─────────────────────────────────────────────────────────────────
// Sent only for donations whose payment the provider confirmed (status `succeeded`). The
// acknowledgement confirms a payment received; it is not a tax receipt, because the
// foundation has not confirmed any tax-deductible status.

export type NotificationDonation = {
  id: string;
  reference: string;
  provider: "stripe" | "pesapal";
  method: "card" | "mobile_money";
  mode: "test" | "live";
  amountMinor: number;
  currency: string;
  donorName: string;
  donorEmail: string;
  message: string | null;
  providerPaymentId: string | null;
  settledAt: Date | null;
};

const providerLabels = { stripe: "Stripe", pesapal: "Pesapal" } as const;
const methodText = { card: "Card", mobile_money: "Mobile Money" } as const;
const notTaxReceipt =
  "This email acknowledges a payment received. It is not a tax receipt.";

function donationAmount(d: NotificationDonation) {
  const decimals = isDonationCurrency(d.currency)
    ? currencyRules[d.currency].decimals
    : 2;
  return `${d.currency} ${(d.amountMinor / 10 ** decimals).toLocaleString(
    "en-GB",
    { minimumFractionDigits: decimals, maximumFractionDigits: decimals },
  )}`;
}

export function buildDonationEmail(
  kind: string,
  donation: NotificationDonation,
  delivery: Pick<DeliveryConfig, "from" | "to">,
) {
  const amount = donationAmount(donation);
  const confirmed = (donation.settledAt ?? new Date())
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const via = `${methodText[donation.method]} via ${providerLabels[donation.provider]}`;
  const test = donation.mode === "test";
  const testLine = test ? ["TEST MODE: no real money was moved.", ""] : [];
  const row = (label: string, value: string) =>
    `<tr><th align="left" style="padding:4px 12px 4px 0">${label}</th><td>${escapeHtml(value)}</td></tr>`;

  if (kind === "donation-acknowledgement") {
    const text = [
      ...testLine,
      `Dear ${donation.donorName},`,
      "",
      `Thank you for your donation of ${amount} to the Kigezi Community Transformation Foundation (KCTF).`,
      "",
      `Reference: ${donation.reference}`,
      `Payment: ${via}`,
      `Confirmed: ${confirmed}`,
      "",
      notTaxReceipt,
      "If you did not make this donation, or have a question about it, reply to this email.",
      "",
      "Kigezi Community Transformation Foundation",
    ].join("\n");
    const html = [
      ...(test
        ? [`<p><strong>TEST MODE: no real money was moved.</strong></p>`]
        : []),
      `<p>Dear ${escapeHtml(donation.donorName)},</p>`,
      `<p>Thank you for your donation of ${escapeHtml(amount)} to the Kigezi Community Transformation Foundation (KCTF).</p>`,
      `<table role="presentation">`,
      row("Reference", donation.reference),
      row("Payment", via),
      row("Confirmed", confirmed),
      `</table>`,
      `<p>${notTaxReceipt} If you did not make this donation, or have a question about it, reply to this email.</p>`,
      `<p>Kigezi Community Transformation Foundation</p>`,
    ].join("\n");
    return {
      from: delivery.from,
      to: [donation.donorEmail],
      reply_to: delivery.to[0],
      subject: `${test ? "[TEST] " : ""}Thank you for your donation to KCTF (${donation.reference})`,
      text,
      html,
    };
  }

  const text = [
    ...testLine,
    `A donation was confirmed by ${providerLabels[donation.provider]}.`,
    "",
    `Reference: ${donation.reference}`,
    `Amount: ${amount}`,
    `Payment: ${via}`,
    `Provider payment: ${donation.providerPaymentId ?? "not reported"}`,
    `Confirmed: ${confirmed}`,
    `Name: ${donation.donorName}`,
    `Email: ${donation.donorEmail}`,
    "",
    ...(donation.message ? [donation.message, ""] : []),
    "Check the provider dashboard before acting on this payment. The donor has been sent an acknowledgement that is not a tax receipt.",
  ].join("\n");
  const html = [
    ...(test
      ? [`<p><strong>TEST MODE: no real money was moved.</strong></p>`]
      : []),
    `<p>A donation was confirmed by ${providerLabels[donation.provider]}.</p>`,
    `<table role="presentation">`,
    row("Reference", donation.reference),
    row("Amount", amount),
    row("Payment", via),
    row("Provider payment", donation.providerPaymentId ?? "not reported"),
    row("Confirmed", confirmed),
    row("Name", donation.donorName),
    row("Email", donation.donorEmail),
    `</table>`,
    ...(donation.message
      ? [`<p style="white-space:pre-wrap">${escapeHtml(donation.message)}</p>`]
      : []),
    `<p>Check the provider dashboard before acting on this payment. The donor has been sent an acknowledgement that is not a tax receipt.</p>`,
  ].join("\n");
  return {
    from: delivery.from,
    to: delivery.to,
    reply_to: donation.donorEmail,
    subject: `${test ? "[TEST] " : ""}KCTF donation confirmed: ${amount} (${donation.reference})`,
    text,
    html,
  };
}
