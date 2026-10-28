"use client";
// One-time donation form. It collects only what the hosted checkout and the
// acknowledgement need; the provider's own page collects card or mobile-money details.
// The amount is validated here for fast feedback and again, authoritatively, on the
// server. Nothing on this page marks a donation as paid.
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  checkAmount,
  currencyRules,
  formatAmount,
  methodLabels,
  parseAmount,
  toInputValue,
  type DonationCurrency,
  type PaymentMethodId,
} from "@/lib/donation-options";
import type { DonationStartResponse } from "@/lib/donation-response";
import { site } from "@/content/site";
import { Arrow } from "@/components/ui/primitives";
import {
  describedBy,
  Field,
  FieldError,
  focusFirstInvalid,
  FormStatus,
  Spinner,
  type FieldErrors,
} from "@/components/forms/fields";
import { TurnstileField, useTurnstile } from "@/components/forms/turnstile";
import { donationSchema } from "@/validation/donation";

export type DonationFormOptions = {
  test: boolean;
  turnstileSiteKey?: string;
  methods: Record<
    PaymentMethodId,
    { available: boolean; currencies: DonationCurrency[] }
  >;
};

type Phase = "idle" | "submitting" | "redirecting" | "unconfirmed" | "failed";

const methodDetails: Record<
  PaymentMethodId,
  { title: string; body: string; provider: string }
> = {
  card: {
    title: "Card",
    body: "Debit or credit card on Stripe’s secure checkout.",
    provider: "Stripe",
  },
  mobile_money: {
    title: "Mobile Money",
    body: "MTN MoMo or Airtel Money on Pesapal’s secure checkout.",
    provider: "Pesapal",
  },
};

const MESSAGE_MAX = 500;
const noSubscription = () => () => {};

export function DonationForm({
  options,
  discussHref = "/donate#give",
}: {
  options: DonationFormOptions;
  discussHref?: string;
}) {
  const available = (Object.keys(options.methods) as PaymentMethodId[]).filter(
    (m) => options.methods[m].available,
  );
  const anyAvailable = available.length > 0;
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [method, setMethod] = useState<PaymentMethodId>(available[0] ?? "card");
  const currencies = options.methods[method].currencies;
  const [currency, setCurrency] = useState<DonationCurrency>(
    currencies[0] ?? "USD",
  );
  const rule = currencyRules[currency];
  const [amount, setAmount] = useState(() =>
    toInputValue(rule.suggested[1], currency),
  );
  const [fields, setFields] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [messageLength, setMessageLength] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  // One key per donation attempt: kept for retries of an uncertain result, replaced when
  // the visitor changes anything after a definite outcome.
  const idempotencyKey = useRef<string | null>(null);
  const turnstile = useTurnstile({
    enabled: anyAvailable,
    siteKey: options.turnstileSiteKey,
    action: "donation",
  });
  const { token, reset: resetTurnstile } = turnstile;

  // Coming back from the provider with the browser's Back button restores this page from
  // the back/forward cache with the "redirecting" state; make it usable again.
  useEffect(() => {
    const restore = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      inFlight.current = false;
      setPhase("idle");
      setStatus("");
      resetTurnstile();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [resetTurnstile]);

  function announce(message: string, focus = false) {
    setStatus(message);
    if (focus) requestAnimationFrame(() => statusRef.current?.focus());
  }

  function changed() {
    if (phase !== "unconfirmed") idempotencyKey.current = null;
    if (phase === "failed") setPhase("idle");
  }

  function chooseMethod(next: PaymentMethodId) {
    setMethod(next);
    const nextCurrency = options.methods[next].currencies[0] ?? currency;
    if (nextCurrency !== currency) {
      setCurrency(nextCurrency);
      setAmount(
        toInputValue(currencyRules[nextCurrency].suggested[1], nextCurrency),
      );
    }
    setFields((f) => ({
      ...f,
      method: undefined,
      currency: undefined,
      amount: undefined,
    }));
    changed();
  }

  function chooseCurrency(next: DonationCurrency) {
    setCurrency(next);
    setAmount(toInputValue(currencyRules[next].suggested[1], next));
    setFields((f) => ({ ...f, currency: undefined, amount: undefined }));
    changed();
  }

  async function start(payload: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("submitting");
    announce("Preparing your secure checkout…");
    let result: DonationStartResponse | undefined;
    try {
      const response = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, token }),
      });
      result = (await response.json()) as DonationStartResponse;
    } catch {
      result = undefined;
    } finally {
      // Turnstile tokens are single-use.
      turnstile.reset();
    }
    if (!result) {
      inFlight.current = false;
      setPhase("unconfirmed");
      announce(
        "We could not confirm that your checkout was started — the connection may have dropped. Nothing has been charged. Use “Try again”; it is safe and will not create a second donation.",
        true,
      );
      return;
    }
    switch (result.state) {
      case "redirect":
        // Stay busy: the page is about to be replaced by the provider's checkout.
        setPhase("redirecting");
        announce(
          `Taking you to ${methodDetails[method].provider}’s secure checkout…`,
        );
        window.location.assign(result.checkoutUrl);
        return;
      case "finished":
        setPhase("redirecting");
        window.location.assign(result.statusUrl);
        return;
      case "unconfirmed":
        inFlight.current = false;
        setPhase("unconfirmed");
        announce(result.message, true);
        return;
      case "invalid":
        inFlight.current = false;
        setPhase("failed");
        if (result.fields) {
          setFields(result.fields);
          focusFirstInvalid(formRef.current);
        }
        announce(result.message, !result.fields);
        return;
      case "conflict":
        idempotencyKey.current = null;
        inFlight.current = false;
        setPhase("failed");
        announce(result.message, true);
        return;
      default:
        inFlight.current = false;
        setPhase("failed");
        announce(result.message, true);
    }
  }

  const [lastPayload, setLastPayload] = useState<Record<
    string,
    unknown
  > | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || !anyAvailable) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      method,
      currency,
      amount,
      name: fd.get("donor-name"),
      email: fd.get("donor-email"),
      message: fd.get("donor-message") || "",
      consent: fd.get("donor-consent") === "on",
      website: fd.get("website") || "",
      idempotencyKey: (idempotencyKey.current ??= crypto.randomUUID()),
    };
    const parsed = donationSchema.safeParse({ ...payload, token });
    const errors: FieldErrors = parsed.success
      ? {}
      : parsed.error.flatten().fieldErrors;
    const check = checkAmount(amount, currency);
    if (!check.ok) errors.amount = [check.message];
    if (Object.values(errors).some(Boolean)) {
      setFields(errors);
      setPhase("idle");
      announce("Please check the highlighted fields.");
      focusFirstInvalid(form);
      return;
    }
    setFields({});
    if (!token) {
      announce(
        turnstile.verification === "error"
          ? "Spam protection could not load. Use “Retry verification”, or discuss your support by email."
          : "Please wait for the spam-protection check to finish, then continue.",
      );
      return;
    }
    setLastPayload(payload);
    void start(payload);
  }

  const busy = phase === "submitting" || phase === "redirecting";
  const minor = parseAmount(amount, currency);
  const suggestedMatch = rule.suggested.includes(minor ?? -1);
  const provider = methodDetails[method].provider;
  const canSubmit = hydrated && anyAvailable && !busy && !!token;
  const error = (key: string) => fields[key]?.[0];

  return (
    <form
      ref={formRef}
      className="donation-form form-card"
      onSubmit={submit}
      noValidate
      aria-busy={busy}
      aria-labelledby="donation-form-title"
    >
      <div className="form-card-head">
        <div className="donation-form-title">
          <h2 id="donation-form-title">Make a one-time gift</h2>
          {options.test && anyAvailable && (
            <span className="test-badge">Test mode · no real payments</span>
          )}
        </div>
        {anyAvailable ? (
          <p className="form-required-note">
            All fields are required unless marked optional.
          </p>
        ) : (
          <div className="form-notice" role="status">
            <strong>Online giving is not available yet.</strong> The foundation
            is still setting up its payment accounts, so nothing can be paid
            here at the moment. You can{" "}
            <Link href={discussHref}>send a donation enquiry</Link> and the
            foundation will reply personally.
          </div>
        )}
      </div>
      {anyAvailable && !hydrated && (
        <p className="form-notice">
          This form needs JavaScript for spam protection and secure checkout,
          and becomes available once the page has loaded. You can also{" "}
          <Link href={discussHref}>send a donation enquiry</Link>.
        </p>
      )}
      <fieldset
        className="donation-fields"
        disabled={!hydrated || busy || !anyAvailable}
      >
        <legend className="visually-hidden">Your donation</legend>

        <fieldset className="choice-group">
          <legend className="group-label">Payment method</legend>
          <div className="method-options">
            {(Object.keys(methodDetails) as PaymentMethodId[]).map((id) => {
              const off = !options.methods[id].available;
              return (
                <label
                  key={id}
                  className={`method-option ${method === id && !off ? "selected" : ""} ${off ? "unavailable" : ""}`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={id}
                    checked={method === id && !off}
                    disabled={off}
                    onChange={() => chooseMethod(id)}
                    aria-describedby={`method-${id}-body`}
                  />
                  <span className="method-option-text">
                    <strong>{methodDetails[id].title}</strong>
                    <span id={`method-${id}-body`}>
                      {off ? "Not available yet" : methodDetails[id].body}
                    </span>
                  </span>
                  <MethodIcon method={id} />
                </label>
              );
            })}
          </div>
        </fieldset>

        {currencies.length > 1 ? (
          <fieldset className="choice-group">
            <legend className="group-label">Currency</legend>
            <div className="segmented">
              {currencies.map((c) => (
                <label key={c} className={currency === c ? "selected" : ""}>
                  <input
                    type="radio"
                    name="currency"
                    value={c}
                    checked={currency === c}
                    onChange={() => chooseCurrency(c)}
                  />
                  {c}
                </label>
              ))}
            </div>
            <FieldError id="currency" message={error("currency")} />
          </fieldset>
        ) : (
          <p className="currency-note">
            Amounts are in <strong>{rule.label}</strong> ({currency}).
          </p>
        )}

        <fieldset className="choice-group">
          <legend className="group-label">Amount</legend>
          <div className="amount-options">
            {rule.suggested.map((value) => (
              <label key={value} className={minor === value ? "selected" : ""}>
                <input
                  type="radio"
                  name="amount-choice"
                  value={value}
                  checked={minor === value}
                  onChange={() => {
                    setAmount(toInputValue(value, currency));
                    setFields((f) => ({ ...f, amount: undefined }));
                    changed();
                  }}
                />
                {formatAmount(value, currency)}
              </label>
            ))}
          </div>
          <Field
            id="donation-amount"
            label={suggestedMatch ? "Or enter another amount" : "Your amount"}
            error={error("amount")}
            hint={`Minimum ${formatAmount(rule.min, currency)}, maximum ${formatAmount(rule.max, currency)}.`}
            className="amount-field"
          >
            <div className="input-affix">
              <span aria-hidden="true">{currency}</span>
              <input
                id="donation-amount"
                name="amount"
                inputMode={rule.decimals ? "decimal" : "numeric"}
                autoComplete="off"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setFields((f) => ({ ...f, amount: undefined }));
                  changed();
                }}
                aria-invalid={!!error("amount")}
                aria-describedby={describedBy("donation-amount", {
                  hint: true,
                  error: !!error("amount"),
                })}
              />
            </div>
          </Field>
        </fieldset>

        <div className="form-row">
          <Field id="donor-name" label="Your name" error={error("name")}>
            <input
              id="donor-name"
              name="donor-name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              onChange={changed}
              aria-invalid={!!error("name")}
              aria-describedby={describedBy("donor-name", {
                error: !!error("name"),
              })}
            />
          </Field>
          <Field
            id="donor-email"
            label="Email address"
            error={error("email")}
            hint="For your payment acknowledgement."
          >
            <input
              id="donor-email"
              name="donor-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              onChange={changed}
              aria-invalid={!!error("email")}
              aria-describedby={describedBy("donor-email", {
                hint: true,
                error: !!error("email"),
              })}
            />
          </Field>
        </div>
        <Field
          id="donor-message"
          label="A message for the foundation"
          optional
          error={error("message")}
          hint={
            <>
              <span>
                Please leave out payment and sensitive personal details.
              </span>
              <span className="field-count" aria-hidden="true">
                {messageLength} / {MESSAGE_MAX}
              </span>
            </>
          }
        >
          <textarea
            id="donor-message"
            name="donor-message"
            rows={3}
            maxLength={MESSAGE_MAX}
            onInput={(e) => setMessageLength(e.currentTarget.value.length)}
            onChange={changed}
            aria-invalid={!!error("message")}
            aria-describedby={describedBy("donor-message", {
              hint: true,
              error: !!error("message"),
            })}
          />
        </Field>

        {method === "mobile_money" && (
          <div className="info-panel">
            <strong>How Mobile Money works</strong>
            <p>
              On Pesapal’s secure page you choose MTN MoMo or Airtel Money and
              enter your number. Your phone then asks you to approve the
              payment. Enter your PIN only on your own phone, never on a
              website. KCTF will never ask for your PIN or a one-time code.
            </p>
          </div>
        )}

        <div className="honeypot" aria-hidden="true">
          <label htmlFor="donation-website">Website</label>
          <input
            id="donation-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <div className={`consent ${error("consent") ? "has-error" : ""}`}>
          <input
            id="donor-consent"
            name="donor-consent"
            type="checkbox"
            required
            onChange={changed}
            aria-invalid={!!error("consent")}
            aria-describedby={describedBy("donor-consent", {
              error: !!error("consent"),
            })}
          />
          <label htmlFor="donor-consent">
            I have read the{" "}
            <Link href="/privacy#donations">privacy notice</Link> and understand
            that {provider} processes my payment.
          </label>
        </div>
        <FieldError id="donor-consent" message={error("consent")} />
      </fieldset>

      {anyAvailable && (
        <>
          <TurnstileField turnstile={turnstile} />
          <dl className="donation-summary" aria-label="Donation summary">
            <div>
              <dt>Your gift</dt>
              <dd>
                {minor !== undefined ? formatAmount(minor, currency) : "—"}
              </dd>
            </div>
            <div>
              <dt>Frequency</dt>
              <dd>One time</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>
                {methodLabels[method]} via {provider}
              </dd>
            </div>
          </dl>
        </>
      )}

      <div className="form-actions">
        {anyAvailable &&
          (phase === "unconfirmed" && lastPayload ? (
            <button
              type="button"
              className="button button-wide"
              disabled={!hydrated || !token}
              onClick={() => start(lastPayload)}
            >
              Try again <Arrow />
            </button>
          ) : (
            <button
              type="submit"
              className="button button-wide"
              disabled={!canSubmit}
            >
              {busy && <Spinner />}
              {busy
                ? "Preparing secure checkout…"
                : "Continue to secure payment"}
              {!busy && <Arrow />}
            </button>
          ))}
        {anyAvailable && (
          <p className="secure-note">
            <LockIcon /> You will finish on {provider}’s secure page. KCTF never
            sees your card details or mobile-money PIN.
          </p>
        )}
      </div>
      <FormStatus
        tone={
          phase === "redirecting"
            ? "submitting"
            : phase === "idle"
              ? "idle"
              : phase
        }
        statusRef={statusRef}
      >
        {status}
      </FormStatus>
      {phase === "unconfirmed" && (
        <p className="small muted">
          If “Try again” keeps failing, email{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> and mention that you
          may already have started a donation.
        </p>
      )}
      <p className="discuss-link">
        Prefer to discuss your support?{" "}
        <Link className="inline-link" href={discussHref}>
          Send a donation enquiry
        </Link>
      </p>
      <p className="small muted tax-note">
        You will receive an acknowledgement of your payment. The foundation has
        not confirmed charitable or tax-exempt status, so this is not a tax
        receipt and no tax relief is implied.
      </p>
    </form>
  );
}

function MethodIcon({ method }: { method: PaymentMethodId }) {
  return method === "card" ? (
    <svg
      className="method-icon"
      viewBox="0 0 24 24"
      width="26"
      height="26"
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 15h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ) : (
    <svg
      className="method-icon"
      viewBox="0 0 24 24"
      width="26"
      height="26"
      aria-hidden="true"
    >
      <rect
        x="6.5"
        y="2.5"
        width="11"
        height="19"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 18.5h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      className="lock-icon"
    >
      <rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" />
      <path
        d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
