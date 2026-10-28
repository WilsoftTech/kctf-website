// Shared building blocks for public forms (enquiries and donations). Labels are always
// visible; optional fields say so in the label; hints and errors are tied to the control
// with aria-describedby so screen readers announce them with the field.
import type { ReactNode, Ref } from "react";

export type FieldErrors = Record<string, string[] | undefined>;

/** `aria-describedby` value for a field with an optional hint and error. */
export function describedBy(
  id: string,
  { hint, error }: { hint?: boolean; error?: boolean },
) {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function Field({
  id,
  label,
  optional = false,
  hint,
  error,
  children,
  className = "",
}: {
  id: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="field-optional"> (optional)</span>}
      </label>
      {children}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field-error" id={`${id}-error`}>
      <span aria-hidden="true" className="field-error-icon">
        !
      </span>
      {message}
    </p>
  );
}

/** Moves focus to the first invalid control after React has rendered the errors. */
export function focusFirstInvalid(form: HTMLElement | null) {
  requestAnimationFrame(() =>
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  );
}

export type StatusTone =
  "idle" | "submitting" | "received" | "unconfirmed" | "failed";

/** Polite live region. Focused for outcomes that need the visitor's attention. */
export function FormStatus({
  tone,
  children,
  statusRef,
}: {
  tone: StatusTone;
  children: ReactNode;
  statusRef?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={statusRef}
      className={`form-status ${tone}`}
      role="status"
      aria-live="polite"
      tabIndex={-1}
    >
      {children}
    </p>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
