-- Donation enquiries reuse the enquiry pipeline. No payment data is stored.
-- AlterEnum
ALTER TYPE "enquiry_topic" ADD VALUE 'donation';
