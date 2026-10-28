import { z } from "zod";
export const enquiryTopics = [
  "general",
  "volunteer",
  "partnership",
  "donation",
] as const;
export type EnquiryTopic = (typeof enquiryTopics)[number];
export const enquirySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your name (at least 2 characters).")
      .max(100, "Keep your name within 100 characters."),
    email: z.email("Enter a valid email address.").max(254),
    topic: z.enum(enquiryTopics),
    message: z
      .string()
      .trim()
      .min(20, "Please include at least 20 characters.")
      .max(3000, "Keep your message within 3,000 characters."),
    consent: z.literal(true, {
      error: "Please confirm you have read the privacy notice.",
    }),
    website: z.string().max(0, "Unable to submit this enquiry.").default(""),
    token: z.string().max(2048).default(""),
    // `email-draft`: the visitor is opening a draft in their own email app and the website
    // keeps a copy (only when the server allows it; see readDraftConfig).
    channel: z.enum(["online", "email-draft"]).default("online"),
    // Generated once per enquiry in the browser and reused for retries of that enquiry.
    idempotencyKey: z.uuid("Please reload the page and try again."),
  })
  .strict();
export type Enquiry = z.infer<typeof enquirySchema>;
