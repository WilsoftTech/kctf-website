// Validated, server-only payment configuration. Every method is off unless it is fully and
// correctly configured; a misconfigured method is reported as unavailable, never faked.
// Issue messages name variables and rules, never values, so they are safe to log.
//
// Gates, in order:
// 1. DONATION_PAYMENTS_ENABLED=true (default off).
// 2. PAYMENTS_MODE=test|live (default test). Test keys only in test mode, live keys only
//    in live mode. Live mode also needs SITE_ENVIRONMENT=production and
//    PAYMENTS_LIVE_APPROVED=true, set only once the foundation has confirmed provider
//    eligibility, merchant agreements and the privacy/records decisions (docs/DONATIONS.md).
//    Test mode is refused in production so visitors never meet a test checkout.
// 3. Shared requirements: SITE_URL, DATABASE_URL, Turnstile, ABUSE_HASH_SECRET.
// 4. Per method: Stripe keys (card) or Pesapal merchant credentials (mobile money).
import "server-only";
import {
  environmentOf,
  readDatabaseUrl,
  testOverride,
  TURNSTILE_VERIFY_URL,
  type TrustedProxy,
} from "@/server/config";
import { readSiteConfig } from "@/lib/site-config";
import {
  methodCurrencies,
  type DonationCurrency,
  type PaymentMethodId,
} from "@/lib/donation-options";
import { log } from "@/server/log";

type Env = Record<string, string | undefined>;

export type PaymentMode = "test" | "live";

export type StripeConfig = {
  provider: "stripe";
  secretKey: string;
  webhookSecret: string;
  currencies: DonationCurrency[];
  apiUrl: string;
};

export type PesapalConfig = {
  provider: "pesapal";
  consumerKey: string;
  consumerSecret: string;
  ipnId: string;
  currencies: DonationCurrency[];
  apiUrl: string;
};

export type ProviderConfig = StripeConfig | PesapalConfig;

export type PaymentsConfig = {
  mode: PaymentMode;
  siteOrigin: string;
  siteHostname: string;
  turnstileSiteKey: string;
  turnstileSecret: string;
  turnstileVerifyUrl: string;
  abuseHashSecret: string;
  trustedProxy: TrustedProxy;
  methods: Partial<{ card: StripeConfig; mobile_money: PesapalConfig }>;
};

export type PaymentsConfigResult = {
  /** Undefined when no method is usable. */
  config?: PaymentsConfig;
  /** Why a method or the whole feature is off. Empty when switched off deliberately. */
  issues: string[];
  enabled: boolean;
};

/** What the public page may know: availability and currencies, never secrets. */
export type PublicPaymentOptions = {
  mode: PaymentMode;
  turnstileSiteKey?: string;
  methods: Record<
    PaymentMethodId,
    { available: boolean; currencies: DonationCurrency[] }
  >;
};

export const STRIPE_API_URL = "https://api.stripe.com";
// developer.pesapal.com, API 3.0: sandbox ("demo") and live base URLs.
export const PESAPAL_API_URLS = {
  test: "https://cybqa.pesapal.com/pesapalv3/api",
  live: "https://pay.pesapal.com/v3/api",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStripe(env: Env, mode: PaymentMode, issues: string[]) {
  const before = issues.length;
  const secretKey = env.STRIPE_SECRET_KEY ?? "";
  // Secret (sk_) or restricted (rk_) keys; the mode in the key must match PAYMENTS_MODE.
  if (!new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]{10,}$`).test(secretKey))
    issues.push(
      `STRIPE_SECRET_KEY must be a Stripe ${mode}-mode secret or restricted key (sk_${mode}_… or rk_${mode}_…).`,
    );
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!/^whsec_[A-Za-z0-9]{10,}$/.test(webhookSecret))
    issues.push(
      "STRIPE_WEBHOOK_SECRET must be the endpoint signing secret (whsec_…).",
    );
  const currencies = (env.STRIPE_CURRENCIES || "USD")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (
    !currencies.length ||
    !currencies.every((c) =>
      (methodCurrencies.card as readonly string[]).includes(c),
    )
  )
    issues.push(
      `STRIPE_CURRENCIES must list currencies from: ${methodCurrencies.card.join(", ")}.`,
    );
  const apiUrl = testOverride(env, "STRIPE_API_URL", issues) ?? STRIPE_API_URL;
  if (issues.length > before) return undefined;
  return {
    provider: "stripe",
    secretKey,
    webhookSecret,
    currencies: [...new Set(currencies)] as DonationCurrency[],
    apiUrl,
  } satisfies StripeConfig;
}

function readPesapal(env: Env, mode: PaymentMode, issues: string[]) {
  const before = issues.length;
  const consumerKey = env.PESAPAL_CONSUMER_KEY ?? "";
  const consumerSecret = env.PESAPAL_CONSUMER_SECRET ?? "";
  if (consumerKey.length < 8 || /\s/.test(consumerKey))
    issues.push("PESAPAL_CONSUMER_KEY is not set.");
  if (consumerSecret.length < 8 || /\s/.test(consumerSecret))
    issues.push("PESAPAL_CONSUMER_SECRET is not set.");
  const ipnId = env.PESAPAL_IPN_ID ?? "";
  if (!UUID.test(ipnId))
    issues.push(
      "PESAPAL_IPN_ID must be the ipn_id returned when the IPN URL was registered.",
    );
  const apiUrl =
    testOverride(env, "PESAPAL_API_URL", issues) ?? PESAPAL_API_URLS[mode];
  if (issues.length > before) return undefined;
  return {
    provider: "pesapal",
    consumerKey,
    consumerSecret,
    ipnId,
    currencies: [...methodCurrencies.mobile_money],
    apiUrl,
  } satisfies PesapalConfig;
}

/** Stripe is configured when any Stripe variable is set; same for Pesapal. */
const mentions = (env: Env, prefix: string) =>
  Object.keys(env).some((k) => k.startsWith(prefix) && !!env[k]);

export function readPaymentsConfig(
  env: Env = process.env,
): PaymentsConfigResult {
  const switchValue = env.DONATION_PAYMENTS_ENABLED ?? "";
  if (switchValue === "" || switchValue === "false")
    return { enabled: false, issues: [] };
  if (switchValue !== "true")
    return {
      enabled: false,
      issues: ["DONATION_PAYMENTS_ENABLED must be `true` or `false`."],
    };

  const issues: string[] = [];
  const modeValue = env.PAYMENTS_MODE || "test";
  if (modeValue !== "test" && modeValue !== "live")
    return {
      enabled: true,
      issues: ["PAYMENTS_MODE must be `test` or `live`."],
    };
  const mode: PaymentMode = modeValue;
  const environment = environmentOf(env);
  if (mode === "live") {
    if (environment !== "production")
      issues.push("PAYMENTS_MODE=live is only allowed in production.");
    if (env.PAYMENTS_LIVE_APPROVED !== "true")
      issues.push(
        "PAYMENTS_LIVE_APPROVED must be `true` before live payments are taken (see docs/DONATIONS.md).",
      );
  } else if (environment === "production") {
    issues.push(
      "PAYMENTS_MODE=test is not allowed in production; use a staging or preview deployment.",
    );
  }

  let siteOrigin = "";
  try {
    siteOrigin = readSiteConfig(env).origin;
    if (!env.SITE_URL) issues.push("SITE_URL is required for payments.");
  } catch (error) {
    issues.push((error as Error).message);
  }
  try {
    readDatabaseUrl(env);
  } catch (error) {
    issues.push((error as Error).message);
  }
  const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const turnstileSecret = env.TURNSTILE_SECRET_KEY ?? "";
  if (!turnstileSiteKey)
    issues.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set.");
  if (!turnstileSecret) issues.push("TURNSTILE_SECRET_KEY is not set.");
  const abuseHashSecret = env.ABUSE_HASH_SECRET ?? "";
  if (abuseHashSecret.length < 32)
    issues.push("ABUSE_HASH_SECRET must be at least 32 characters.");
  const trustedProxy = (env.TRUSTED_PROXY || "none") as TrustedProxy;
  if (!["vercel", "none"].includes(trustedProxy))
    issues.push("TRUSTED_PROXY must be `vercel` or `none`.");
  const turnstileVerifyUrl =
    testOverride(env, "TURNSTILE_VERIFY_URL", issues) ?? TURNSTILE_VERIFY_URL;
  if (issues.length) return { enabled: true, issues };

  // A provider whose variables are all empty is simply not offered; a provider with
  // some variables set but invalid is reported, so a typo never goes unnoticed.
  const methods: PaymentsConfig["methods"] = {};
  if (mentions(env, "STRIPE_")) {
    const stripe = readStripe(env, mode, issues);
    if (stripe) methods.card = stripe;
  }
  if (mentions(env, "PESAPAL_")) {
    const pesapal = readPesapal(env, mode, issues);
    if (pesapal) methods.mobile_money = pesapal;
  }
  if (!methods.card && !methods.mobile_money) {
    if (!issues.length)
      issues.push(
        "No payment provider is configured (Stripe or Pesapal variables).",
      );
    return { enabled: true, issues };
  }
  return {
    enabled: true,
    issues,
    config: {
      mode,
      siteOrigin,
      siteHostname: new URL(siteOrigin).hostname,
      turnstileSiteKey,
      turnstileSecret,
      turnstileVerifyUrl,
      abuseHashSecret,
      trustedProxy,
      methods,
    },
  };
}

let reported = "";
/** Reads payment configuration and logs problems once per distinct issue set. */
export function paymentsConfig(env: Env = process.env): PaymentsConfigResult {
  const result = readPaymentsConfig(env);
  const missing = result.issues.join(" ");
  if (result.enabled && missing && missing !== reported) {
    reported = missing;
    log("error", "payments_config_invalid", { missing });
  }
  return result;
}

export function publicPaymentOptions(
  result: PaymentsConfigResult,
): PublicPaymentOptions {
  const config = result.config;
  const method = (id: PaymentMethodId) => {
    const provider = config?.methods[id];
    return {
      available: !!provider,
      currencies: provider ? provider.currencies : [],
    };
  };
  return {
    mode: config?.mode ?? "test",
    turnstileSiteKey: config?.turnstileSiteKey,
    methods: { card: method("card"), mobile_money: method("mobile_money") },
  };
}
