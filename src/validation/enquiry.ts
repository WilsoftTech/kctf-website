import { z } from "zod";
export const enquirySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your name (at least 2 characters).")
      .max(100),
    email: z.email("Enter a valid email address.").max(254),
    topic: z.enum(["general", "volunteer", "partnership"]),
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
  })
  .strict();
export type Enquiry = z.infer<typeof enquirySchema>;
