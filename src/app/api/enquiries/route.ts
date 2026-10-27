import { createHash } from "node:crypto";
import { enquirySchema } from "@/validation/enquiry";
import { enquiriesEnabled, rateLimit } from "@/lib/enquiries";
import { site } from "@/content/site";
export const runtime = "nodejs";
function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  const expected = process.env.SITE_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    return json({ error: "Please submit the form from this website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Unsupported request format." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 16384)
    return json({ error: "Message is too large." }, 413);
  let raw = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing enquiry." }, 400);
    const parts: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) {
        await reader.cancel();
        return json({ error: "Message is too large." }, 413);
      }
      parts.push(value);
    }
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const p of parts) {
      merged.set(p, offset);
      offset += p.length;
    }
    raw = new TextDecoder().decode(merged);
  } catch {
    return json({ error: "Unable to read your enquiry." }, 400);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid enquiry format." }, 400);
  }
  const parsed = enquirySchema.safeParse(data);
  if (!parsed.success)
    return json(
      {
        error: "Please check your details.",
        fields: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  if (!enquiriesEnabled())
    return json(
      {
        error: `Online delivery is not available yet. Please email ${site.email}.`,
      },
      503,
    );
  // Only use proxy-supplied IPs as a burst hint. Turnstile remains the authoritative bot check.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!rateLimit(createHash("sha256").update(ip).digest("hex")))
    return json(
      { error: "Too many attempts. Please wait a minute and try again." },
      429,
    );
  const d = parsed.data;
  try {
    const verify = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY!,
          response: d.token,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!verify.ok)
      return json(
        { error: "Verification is unavailable. Please try again." },
        503,
      );
    const result = (await verify.json()) as {
      success: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !result.success ||
      result.hostname !== new URL(expected).hostname ||
      result.action !== "enquiry"
    )
      return json({ error: "Please complete the verification again." }, 400);
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ENQUIRY_FROM,
        to: [process.env.ENQUIRY_TO || site.email],
        reply_to: d.email,
        subject: `KCTF ${d.topic} enquiry`,
        text: `Name: ${d.name}\nEmail: ${d.email}\nTopic: ${d.topic}\n\n${d.message}\n\nPrivacy notice acknowledged.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!sent.ok)
      return json(
        {
          error:
            "Your enquiry could not be confirmed. Please email us directly.",
        },
        502,
      );
    return json(
      {
        message:
          "Your enquiry has been accepted for email delivery. Thank you for getting in touch.",
      },
      200,
    );
  } catch {
    return json(
      {
        error:
          "Delivery could not be confirmed. Please email us directly rather than resubmitting.",
      },
      502,
    );
  }
}
