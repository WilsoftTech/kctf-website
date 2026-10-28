-- Online donations (Stripe Checkout, Pesapal mobile money). Additive only: new enums and
-- tables, a nullable donation_id on email_outbox and enquiry_id made nullable so a job can
-- belong to a donation. Existing enquiry rows and jobs are unchanged.
-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('stripe', 'pesapal');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('card', 'mobile_money');

-- CreateEnum
CREATE TYPE "payment_mode" AS ENUM ('test', 'live');

-- CreateEnum
CREATE TYPE "donation_status" AS ENUM ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'reversed', 'needs_review');

-- AlterTable
ALTER TABLE "email_outbox" ADD COLUMN     "donation_id" UUID,
ALTER COLUMN "enquiry_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "access_token_hash" CHAR(64) NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "method" "payment_method" NOT NULL,
    "mode" "payment_mode" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "donation_status" NOT NULL DEFAULT 'created',
    "donor_name" VARCHAR(100) NOT NULL,
    "donor_email" VARCHAR(254) NOT NULL,
    "message" VARCHAR(500),
    "privacy_notice_version" VARCHAR(32) NOT NULL,
    "provider_session_id" VARCHAR(255),
    "provider_payment_id" VARCHAR(255),
    "checkout_url" VARCHAR(2048),
    "status_reason" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(3),
    "last_checked_at" TIMESTAMPTZ(3),

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "donation_id" UUID,
    "outcome" VARCHAR(40) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donations_reference_key" ON "donations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "donations_idempotency_key_key" ON "donations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "donations_access_token_hash_key" ON "donations"("access_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "donations_provider_session_id_key" ON "donations"("provider_session_id");

-- CreateIndex
CREATE INDEX "donations_status_created_at_idx" ON "donations"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_events_donation_id_idx" ON "payment_events"("donation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_donation_id_kind_key" ON "email_outbox"("donation_id", "kind");

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express in the schema.
-- Every outbox job belongs to exactly one enquiry or one donation.
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_single_owner_check"
    CHECK (("enquiry_id" IS NULL) <> ("donation_id" IS NULL));
-- Amounts are positive and currencies are upper-case ISO 4217 codes.
ALTER TABLE "donations" ADD CONSTRAINT "donations_amount_positive_check"
    CHECK ("amount_minor" > 0);
ALTER TABLE "donations" ADD CONSTRAINT "donations_currency_format_check"
    CHECK ("currency" ~ '^[A-Z]{3}$');
-- A confirmed donation always records when it was confirmed.
ALTER TABLE "donations" ADD CONSTRAINT "donations_settled_at_check"
    CHECK ("status" <> 'succeeded' OR "settled_at" IS NOT NULL);
