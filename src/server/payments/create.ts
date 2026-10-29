// Starting an online donation. Order matters, as for enquiries: cheap request checks, the
// idempotent replay lookup, shared abuse limits, Turnstile, then the donation row is
// committed BEFORE the provider is called. The provider call runs outside any database
// transaction and carries a stable idempotency key, so an uncertain result is resolved by
// retrying with the same client key. Nothing here marks a donation as paid.
import { createHash } from "node:crypto";
import { site } from "@/content/site";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy";
import { ExecutionBudget } from "@/server/execution-budget";
import { checkAmount, type DonationCurrency } from "@/lib/donation-options";
import type { DonationStartResponse } from "@/lib/donation-response";
import {
  clientIp,
  admitAttempt,
  enforceLimits,
  limitsFor,
  QuotaExceeded,
} from "@/server/enquiries/abuse";
import { readLimitedText } from "@/server/enquiries/submit";
import { verifyTurnstile } from "@/server/enquiries/turnstile";
import { log, safeErrorCode } from "@/server/log";
import {
  accessTokenFor,
  hashAccessToken,
  newDonationReference,
  providerFor,
  statusPath,
  type PaymentDeps,
} from "@/server/payments/common";
import type { PaymentsConfig } from "@/server/payments/config";
import { OPEN_STATUSES } from "@/server/payments/state";
import { donationSchema, type DonationRequest } from "@/validation/donation";

export const MAX_DONATION_BODY_BYTES = 8_192;

export type StartResult = { status: number; body: DonationStartResponse };
const result = (status: number, body: DonationStartResponse): StartResult => ({
  status,
  body,
});
const talkToUs = `You can also discuss your support by emailing ${site.email}.`;

export function donationRequestHash(d: DonationRequest, amountMinor: number) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        d.method,
        d.currency,
        amountMinor,
        d.name,
        d.email.toLowerCase(),
        d.message,
      ]),
    )
    .digest("hex");
}

type Existing = {
  id: string;
  reference: string;
  requestHash: string;
  status: string;
  checkoutUrl: string | null;
  amountMinor: number;
  currency: string;
  donorName: string;
  donorEmail: string;
};

async function checkout(
  donation: Existing,
  data: DonationRequest,
  config: PaymentsConfig,
  deps: PaymentDeps,
): Promise<StartResult> {
  const token = accessTokenFor(donation.id, config.abuseHashSecret);
  const statusUrl = statusPath(token);
  if (!OPEN_STATUSES.includes(donation.status as "created"))
    return result(200, {
      state: "finished",
      statusUrl,
      reference: donation.reference,
    });
  if (donation.checkoutUrl)
    return result(200, {
      state: "redirect",
      checkoutUrl: donation.checkoutUrl,
      statusUrl,
      reference: donation.reference,
    });

  const provider = providerFor(
    config,
    data.method,
    deps.fetchImpl,
    deps.budget,
  )!;
  const created = await provider.createCheckout({
    donationId: donation.id,
    reference: donation.reference,
    amountMinor: donation.amountMinor,
    currency: donation.currency as DonationCurrency,
    donorName: donation.donorName,
    donorEmail: donation.donorEmail,
    returnUrl: `${config.siteOrigin}${statusUrl}`,
    cancelUrl: `${config.siteOrigin}${statusPath(token, true)}`,
  });
  const db = deps.getDb();
  if (created.kind === "permanent") {
    await db.donation.updateMany({
      where: { id: donation.id, status: "created" },
      data: {
        status: "failed",
        statusReason: created.code,
        settledAt: new Date(),
      },
    });
    log("error", "donation_checkout_refused", {
      donationId: donation.id,
      provider: provider.id,
      code: created.code,
    });
    return result(502, {
      state: "unavailable",
      message: `The payment provider could not start a checkout, so nothing was charged. Please try again later. ${talkToUs}`,
    });
  }
  if (created.kind === "retryable") {
    log("warn", "donation_checkout_uncertain", {
      donationId: donation.id,
      provider: provider.id,
      code: created.code,
    });
    return result(503, {
      state: "unconfirmed",
      message:
        "We could not reach the payment provider. Nothing has been charged. Please use “Try again”: it is safe and will not create a second donation.",
    });
  }
  await db.donation.updateMany({
    where: { id: donation.id, status: "created" },
    data: {
      status: "pending",
      providerSessionId: created.sessionId,
      checkoutUrl: created.url,
    },
  });
  log("info", "donation_checkout_created", {
    donationId: donation.id,
    provider: provider.id,
  });
  return result(201, {
    state: "redirect",
    checkoutUrl: created.url,
    statusUrl,
    reference: donation.reference,
  });
}

const existingSelect = {
  id: true,
  reference: true,
  requestHash: true,
  status: true,
  checkoutUrl: true,
  amountMinor: true,
  currency: true,
  donorName: true,
  donorEmail: true,
} as const;

export async function startDonation(
  request: Request,
  deps: PaymentDeps,
): Promise<StartResult> {
  deps = {
    ...deps,
    budget: deps.budget ?? new ExecutionBudget(25_000, request.signal),
  };
  if (request.headers.get("origin") !== deps.siteOrigin)
    return result(403, {
      state: "invalid",
      message: "Please use the donation form on this website.",
    });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return result(415, {
      state: "invalid",
      message: "Unsupported request format.",
    });
  let json: unknown;
  try {
    const read = await readLimitedText(request, MAX_DONATION_BODY_BYTES);
    if ("tooLarge" in read)
      return result(413, {
        state: "invalid",
        message: "This request is too large.",
      });
    json = JSON.parse(read.text);
  } catch {
    return result(400, {
      state: "invalid",
      message: "Invalid request format.",
    });
  }
  const parsed = donationSchema.safeParse(json);
  if (!parsed.success)
    return result(400, {
      state: "invalid",
      message: "Please check your details.",
      fields: parsed.error.flatten().fieldErrors,
    });
  const data = parsed.data;

  const { config } = deps.readConfig();
  const method = config?.methods[data.method];
  if (!config || !method)
    return result(503, {
      state: "unavailable",
      message: `${data.method === "card" ? "Card" : "Mobile Money"} donations are not available at the moment. Nothing was charged. ${talkToUs}`,
    });
  if (!method.currencies.includes(data.currency))
    return result(400, {
      state: "invalid",
      message: "Please check your details.",
      fields: {
        currency: ["This currency is not available for this payment method."],
      },
    });
  // The server parses the amount itself; a client-computed minor amount is never trusted.
  const amount = checkAmount(data.amount, data.currency);
  if (!amount.ok)
    return result(400, {
      state: "invalid",
      message: "Please check your details.",
      fields: { amount: [amount.message] },
    });
  const hash = donationRequestHash(data, amount.minor);

  try {
    const db = deps.getDb();
    const ip = clientIp(request.headers, config.trustedProxy);
    if (!(await admitAttempt(db, ip, config.abuseHashSecret, "donation")))
      throw new QuotaExceeded();
    const existing = await db.donation.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select: existingSelect,
    });
    if (existing) {
      if (existing.requestHash !== hash)
        return result(409, {
          state: "conflict",
          message:
            "This form was already used for a different donation. Please review the amount and continue again.",
        });
      return await checkout(existing, data, config, deps);
    }

    const verification = await verifyTurnstile({
      token: data.token,
      secret: config.turnstileSecret,
      hostname: config.siteHostname,
      verifyUrl: config.turnstileVerifyUrl,
      remoteIp: ip,
      action: "donation",
      fetchImpl: deps.fetchImpl,
      budget: deps.budget,
    });
    if (verification === "unavailable")
      return result(503, {
        state: "unavailable",
        message: `Spam protection could not be checked, so no checkout was started. Please try again shortly. ${talkToUs}`,
      });
    if (verification === "invalid")
      return result(400, {
        state: "invalid",
        message:
          "The spam-protection check did not succeed. Please complete it again and continue.",
      });

    let created: Existing | undefined;
    for (let attempt = 0; !created && attempt < 3; attempt++) {
      try {
        const id = crypto.randomUUID();
        created = await db.$transaction(async (tx) => {
          await enforceLimits(
            tx,
            limitsFor(
              { ip, email: data.email },
              config.abuseHashSecret,
              "donation",
            ),
          );
          return tx.donation.create({
            data: {
              id,
              reference: newDonationReference(),
              idempotencyKey: data.idempotencyKey,
              requestHash: hash,
              accessTokenHash: hashAccessToken(
                accessTokenFor(id, config.abuseHashSecret),
              ),
              provider: method.provider,
              method: data.method,
              mode: config.mode,
              amountMinor: amount.minor,
              currency: data.currency,
              donorName: data.name,
              donorEmail: data.email,
              message: data.message || null,
              privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
            },
            select: existingSelect,
          });
        });
      } catch (error) {
        if ((error as { code?: string })?.code !== "P2002") throw error;
        // A concurrent request with the same client key won: answer as a replay.
        const raced = await db.donation.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          select: existingSelect,
        });
        if (raced)
          return raced.requestHash === hash
            ? await checkout(raced, data, config, deps)
            : result(409, {
                state: "conflict",
                message: "This form was already used for a different donation.",
              });
        // Otherwise the random reference collided; try a new one.
      }
    }
    if (!created) throw new Error("reference_collision");
    log("info", "donation_created", { donationId: created.id });
    return await checkout(created, data, config, deps);
  } catch (error) {
    if (error instanceof QuotaExceeded)
      return result(429, {
        state: "rate_limited",
        message: `Too many donation attempts. Please wait and try again. ${talkToUs}`,
      });
    log("error", "donation_start_failed", { code: safeErrorCode(error) });
    return result(503, {
      state: "unconfirmed",
      message:
        "We could not confirm that your checkout was started. Nothing has been charged. Please use “Try again”: it is safe and will not create a second donation.",
    });
  }
}
