// Donation amounts and currencies, shared by the form and the server. The server is the
// authority: it re-parses the amount, checks it against these limits and only accepts a
// currency that the configured provider for the chosen method actually offers. No
// exchange rates exist anywhere in this code: each currency has its own amounts.
//
// Limits are KCTF policy set inside each provider's own rules:
// - Stripe minimum charge: 0.50 USD, 0.50 EUR, 0.30 GBP (docs.stripe.com/currencies). The
//   5.00 floor here sits well above those, also after conversion to any settlement
//   currency, and makes the form less attractive for card testing.
// - Stripe maximum: 8 digits in Stripe units for non-card methods, more for cards. 10,000
//   is far below both.
// - Pesapal / mobile money: no published per-transaction limits were found in Pesapal's
//   API documentation. The UGX bounds are conservative placeholders to confirm with
//   Pesapal and the networks during merchant onboarding (docs/DONATIONS.md).

export const paymentMethods = ["card", "mobile_money"] as const;
export type PaymentMethodId = (typeof paymentMethods)[number];

export const donationCurrencies = ["USD", "EUR", "GBP", "UGX"] as const;
export type DonationCurrency = (typeof donationCurrencies)[number];

type CurrencyRule = {
  /** ISO 4217 minor-unit exponent. UGX has none. */
  decimals: 0 | 2;
  label: string;
  /** Limits and suggestions in the currency's ISO minor unit. */
  min: number;
  max: number;
  suggested: readonly number[];
};

export const currencyRules: Record<DonationCurrency, CurrencyRule> = {
  USD: {
    decimals: 2,
    label: "US dollars",
    min: 5_00,
    max: 10_000_00,
    suggested: [25_00, 50_00, 100_00, 250_00],
  },
  EUR: {
    decimals: 2,
    label: "Euros",
    min: 5_00,
    max: 10_000_00,
    suggested: [25_00, 50_00, 100_00, 250_00],
  },
  GBP: {
    decimals: 2,
    label: "Pounds sterling",
    min: 5_00,
    max: 10_000_00,
    suggested: [20_00, 40_00, 80_00, 200_00],
  },
  UGX: {
    decimals: 0,
    label: "Ugandan shillings",
    min: 5_000,
    max: 5_000_000,
    suggested: [20_000, 50_000, 100_000, 250_000],
  },
};

/** Currencies each method can ever offer; configuration narrows this further. */
export const methodCurrencies: Record<
  PaymentMethodId,
  readonly DonationCurrency[]
> = {
  card: ["USD", "EUR", "GBP"],
  mobile_money: ["UGX"],
};

export const methodLabels: Record<PaymentMethodId, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
};

export function isDonationCurrency(value: string): value is DonationCurrency {
  return (donationCurrencies as readonly string[]).includes(value);
}

/**
 * Parses an amount typed in major units ("50", "1,000", "12.50") into minor units.
 * Grouping commas and spaces are accepted; anything else, more decimals than the
 * currency allows, or a value that is not a safe integer is rejected (undefined).
 */
export function parseAmount(
  input: string,
  currency: DonationCurrency,
): number | undefined {
  const { decimals } = currencyRules[currency];
  const clean = input.trim().replace(/[\s,]/g, "");
  const pattern = decimals === 0 ? /^\d{1,9}$/ : /^\d{1,9}(?:\.\d{1,2})?$/;
  if (!pattern.test(clean)) return undefined;
  const [whole, fraction = ""] = clean.split(".");
  const minor =
    Number(whole) * 10 ** decimals +
    (decimals ? Number(fraction.padEnd(decimals, "0")) : 0);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

export type AmountCheck =
  { ok: true; minor: number } | { ok: false; message: string };

export function checkAmount(
  input: string,
  currency: DonationCurrency,
): AmountCheck {
  const rule = currencyRules[currency];
  const minor = parseAmount(input, currency);
  if (minor === undefined)
    return {
      ok: false,
      message:
        rule.decimals === 0
          ? `Enter a whole number of ${rule.label.toLowerCase()}, without decimals.`
          : "Enter an amount such as 25 or 25.50.",
    };
  if (minor < rule.min)
    return {
      ok: false,
      message: `The minimum online gift is ${formatAmount(rule.min, currency)}.`,
    };
  if (minor > rule.max)
    return {
      ok: false,
      message: `The maximum online gift is ${formatAmount(rule.max, currency)}. For larger gifts, please discuss your support with the foundation.`,
    };
  return { ok: true, minor };
}

/** "UGX 50,000" / "USD 25.00": the ISO code is always shown, never a bare symbol. */
export function formatAmount(minor: number, currency: DonationCurrency) {
  const { decimals } = currencyRules[currency];
  const value = minor / 10 ** decimals;
  return `${currency} ${value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Major-unit string for an input field ("25", "25.50", "50000"). */
export function toInputValue(minor: number, currency: DonationCurrency) {
  const { decimals } = currencyRules[currency];
  if (!decimals) return String(minor);
  const value = (minor / 10 ** decimals).toFixed(decimals);
  return value.endsWith(".00") ? value.slice(0, -3) : value;
}
