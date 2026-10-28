-- Records how an enquiry reached the website. Existing rows were all online submissions.
-- CreateEnum
CREATE TYPE "enquiry_channel" AS ENUM ('online', 'email_draft');

-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "channel" "enquiry_channel" NOT NULL DEFAULT 'online';
