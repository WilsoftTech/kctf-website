ALTER TABLE donations
  ADD COLUMN collected_minor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN refunded_minor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN pending_refund_minor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN reversed_minor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN refund_state VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN dispute_state VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN disputed_minor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN financial_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN financial_checked_at TIMESTAMPTZ(3),
  ADD COLUMN financial_review_reason VARCHAR(64),
  ADD COLUMN reconcile_claim_token UUID,
  ADD COLUMN reconcile_claimed_at TIMESTAMPTZ(3),
  ADD COLUMN reconcile_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_reconcile_error VARCHAR(64);
-- Backfill new accounting fields only; existing payment state/history is retained.
UPDATE donations SET collected_minor = amount_minor WHERE status IN ('succeeded', 'reversed');
UPDATE donations SET reversed_minor = amount_minor, financial_review_reason = 'pesapal_reversal_review' WHERE status = 'reversed';
ALTER TABLE donations ADD CONSTRAINT donation_financial_amounts CHECK (
  collected_minor >= 0 AND refunded_minor >= 0 AND pending_refund_minor >= 0
  AND reversed_minor >= 0 AND disputed_minor >= 0
  AND refunded_minor <= collected_minor AND reversed_minor <= collected_minor
  AND refunded_minor::bigint + pending_refund_minor <= collected_minor
);
CREATE INDEX donations_financial_checked_at_idx ON donations(financial_checked_at);

CREATE TABLE payment_adjustments (
 id UUID PRIMARY KEY, donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 provider payment_provider NOT NULL, external_id VARCHAR(255) NOT NULL, kind VARCHAR(16) NOT NULL,
 amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0), currency CHAR(3) NOT NULL,
 status VARCHAR(32) NOT NULL, source VARCHAR(16) NOT NULL DEFAULT 'provider', recorded_by VARCHAR(64), reason VARCHAR(64),
 provider_created_at TIMESTAMPTZ(3), observed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX payment_adjustment_observation_key ON payment_adjustments(provider,external_id,status,amount_minor);
CREATE INDEX payment_adjustments_donation_id_idx ON payment_adjustments(donation_id);

CREATE TABLE worker_runs (
 id UUID PRIMARY KEY, started_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TIMESTAMPTZ(3), status VARCHAR(16) NOT NULL DEFAULT 'running',
 sent INTEGER NOT NULL DEFAULT 0, retried INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
 payment_checked INTEGER NOT NULL DEFAULT 0, payment_failed INTEGER NOT NULL DEFAULT 0,
 duration_ms INTEGER NOT NULL DEFAULT 0, code VARCHAR(64)
);
CREATE INDEX worker_runs_started_at_idx ON worker_runs(started_at);
