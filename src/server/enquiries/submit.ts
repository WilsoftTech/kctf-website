// Enquiry submission pipeline. Order matters: cheap request checks first, then the
// idempotent replay lookup (so an uncertain retry never needs a second Turnstile pass or
// creates a duplicate), shared abuse limits, Turnstile, and finally one transaction that
// saves the enquiry together with its email-outbox job. Success is returned only after
// that transaction commits.
import { createHash } from "node:crypto";
import { site } from "@/content/site";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy";
import type { EnquiryResponse } from "@/lib/enquiry-response";
import type { DraftConfig, EnquiryConfigResult } from "@/server/config";
import type { Database } from "@/server/db";
import { clientIp, consumeLimits, limitsFor } from "@/server/enquiries/abuse";
import { verifyTurnstile } from "@/server/enquiries/turnstile";
import { log, safeErrorCode } from "@/server/log";
import {
  enquiryReference,
  STAFF_NOTIFICATION,
} from "@/server/outbox/notification";
import { enquirySchema, type Enquiry } from "@/validation/enquiry";

export const MAX_BODY_BYTES = 16_384;

export type SubmitResult = {
  status: number;
  body: EnquiryResponse;
  /** True when a new outbox job was committed and a worker run is worthwhile. */
  queued?: boolean;
};

export type SubmitDeps = {
  siteOrigin: string;
  readConfig: () => EnquiryConfigResult;
  getDb: () => Database;
  fetchImpl?: typeof fetch;
};

const emailUs = `Please email ${site.email} directly instead.`;
const result = (status: number, body: EnquiryResponse): SubmitResult => ({
  status,
  body,
});

/** Reads at most `limit` bytes from the stream, without trusting Content-Length. */
export async function readLimitedText(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    return { tooLarge: true as const };
  const reader = request.body?.getReader();
  if (!reader) return { text: "" };
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      return { tooLarge: true as const };
    }
    parts.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return { text: new TextDecoder("utf-8", { fatal: true }).decode(merged) };
}

export function requestHash(e: Enquiry) {
  return createHash("sha256")
    .update(JSON.stringify([e.name, e.email.toLowerCase(), e.topic, e.message]))
    .digest("hex");
}

function received(
  id: string,
  replay: boolean,
  { topic, channel }: Pick<Enquiry, "topic" | "channel">,
): SubmitResult {
  // A donation enquiry is a conversation, never a payment: say so explicitly.
  const noPayment =
    topic === "donation" ? " No payment has been made or taken." : "";
  return result(replay ? 200 : 201, {
    state: "received",
    reference: enquiryReference(id),
    replay,
    // A saved draft notifies nobody: only the visitor's own email reaches the foundation.
    message:
      channel === "email-draft"
        ? `A copy of your ${topic === "donation" ? "donation " : ""}enquiry has been saved.${noPayment} Your email app will open with a draft: press Send there so the foundation receives it.`
        : `Thank you — your ${topic === "donation" ? "donation " : ""}enquiry has been received and saved.${noPayment} The foundation will reply by email.`,
  });
}

function conflict(): SubmitResult {
  return result(409, {
    state: "conflict",
    message:
      "This form was already used to send a different enquiry. Please submit again to send this one.",
  });
}

async function findExisting(db: Database, data: Enquiry) {
  const existing = await db.enquiry.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    select: { id: true, requestHash: true },
  });
  if (!existing) return undefined;
  return existing.requestHash === requestHash(data)
    ? received(existing.id, true, data)
    : conflict();
}

/** Keeps a copy of an email-draft enquiry. No Turnstile and no outbox job. */
async function saveDraft(
  request: Request,
  data: Enquiry,
  config: DraftConfig,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  let db: Database | undefined;
  try {
    db = deps.getDb();
    const replay = await findExisting(db, data);
    if (replay) return replay;
    const ip = clientIp(request.headers, config.trustedProxy);
    const allowed = await consumeLimits(
      db,
      limitsFor({ ip, email: data.email }, config.abuseHashSecret),
    );
    if (!allowed) {
      log("warn", "enquiry_rate_limited", { channel: data.channel });
      return result(429, {
        state: "rate_limited",
        message:
          "We have received several enquiries recently, so no copy was saved.",
      });
    }
    const saved = await db.enquiry.create({
      data: {
        idempotencyKey: data.idempotencyKey,
        requestHash: requestHash(data),
        name: data.name,
        email: data.email,
        topic: data.topic,
        channel: "email_draft",
        message: data.message,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      },
      select: { id: true },
    });
    log("info", "enquiry_draft_saved", { enquiryId: saved.id });
    return received(saved.id, false, data);
  } catch (error) {
    // A concurrent request with the same key committed first.
    if (db && (error as { code?: string })?.code === "P2002") {
      try {
        const replay = await findExisting(db, data);
        if (replay) return replay;
      } catch {
        // Fall through to the uncertain response.
      }
    }
    log("error", "enquiry_draft_save_failed", { code: safeErrorCode(error) });
    return result(503, {
      state: "unconfirmed",
      message: "We could not confirm that a copy was saved.",
    });
  }
}

export async function submitEnquiry(
  request: Request,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  if (request.headers.get("origin") !== deps.siteOrigin)
    return result(403, {
      state: "invalid",
      message: "Please submit the form from this website.",
    });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return result(415, {
      state: "invalid",
      message: "Unsupported request format.",
    });

  let text: string;
  try {
    const read = await readLimitedText(request, MAX_BODY_BYTES);
    if ("tooLarge" in read)
      return result(413, {
        state: "invalid",
        message: "Your enquiry is too large.",
      });
    text = read.text;
  } catch {
    return result(400, {
      state: "invalid",
      message: "Unable to read your enquiry.",
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return result(400, {
      state: "invalid",
      message: "Invalid enquiry format.",
    });
  }
  const parsed = enquirySchema.safeParse(json);
  if (!parsed.success)
    return result(400, {
      state: "invalid",
      message: "Please check your details.",
      fields: parsed.error.flatten().fieldErrors,
    });
  const data = parsed.data;

  const configResult = deps.readConfig();
  if (data.channel === "email-draft") {
    if (configResult.mode === "email-draft" && configResult.drafts)
      return saveDraft(request, data, configResult.drafts, deps);
    return result(503, {
      state: "unavailable",
      message: `The enquiry form has changed since this page loaded, so nothing was saved. Please reload the page. ${emailUs}`,
    });
  }
  if (configResult.mode !== "online")
    return result(503, {
      state: "unavailable",
      message: `Online enquiries are not available at the moment. ${emailUs}`,
    });
  const config = configResult.config;

  let db: Database;
  try {
    db = deps.getDb();
    const replay = await findExisting(db, data);
    if (replay) {
      log("info", "enquiry_replay", { replay: replay.status === 200 });
      return replay;
    }
    const ip = clientIp(request.headers, config.trustedProxy);
    const allowed = await consumeLimits(
      db,
      limitsFor({ ip, email: data.email }, config.abuseHashSecret),
    );
    if (!allowed) {
      log("warn", "enquiry_rate_limited");
      return result(429, {
        state: "rate_limited",
        message:
          "We have received several enquiries recently. Please wait an hour, or email us directly.",
      });
    }
    const verification = await verifyTurnstile({
      token: data.token,
      secret: config.turnstileSecret,
      hostname: config.siteHostname,
      verifyUrl: config.turnstileVerifyUrl,
      remoteIp: ip,
      fetchImpl: deps.fetchImpl,
    });
    if (verification === "unavailable")
      return result(503, {
        state: "unavailable",
        message: `Spam protection could not be checked, so your enquiry was not saved. Please try again shortly. ${emailUs}`,
      });
    if (verification === "invalid")
      return result(400, {
        state: "invalid",
        message:
          "The spam-protection check did not succeed. Please complete it again and resubmit.",
      });
  } catch (error) {
    log("error", "enquiry_precheck_failed", { code: safeErrorCode(error) });
    return result(503, {
      state: "unavailable",
      message: `Your enquiry could not be saved just now. Please try again shortly. ${emailUs}`,
    });
  }

  try {
    const enquiry = await db.$transaction(async (tx) => {
      const saved = await tx.enquiry.create({
        data: {
          idempotencyKey: data.idempotencyKey,
          requestHash: requestHash(data),
          name: data.name,
          email: data.email,
          topic: data.topic,
          message: data.message,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        },
        select: { id: true },
      });
      await tx.emailOutbox.create({
        data: { enquiryId: saved.id, kind: STAFF_NOTIFICATION },
      });
      return saved;
    });
    log("info", "enquiry_saved", { enquiryId: enquiry.id });
    return { ...received(enquiry.id, false, data), queued: true };
  } catch (error) {
    // A concurrent request with the same key committed first.
    if ((error as { code?: string })?.code === "P2002") {
      try {
        const replay = await findExisting(db, data);
        if (replay) return replay;
      } catch {
        // Fall through to the uncertain response.
      }
    }
    // The commit may have succeeded before the connection failed. A retry with the same
    // idempotency key resolves this without creating a duplicate.
    log("error", "enquiry_save_uncertain", { code: safeErrorCode(error) });
    return result(503, {
      state: "unconfirmed",
      message:
        "We could not confirm that your enquiry was saved. Please use “Try again” — it is safe and will not send a duplicate.",
    });
  }
}
