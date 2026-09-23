-- Company details editable from Settings: contact fields, and how emails to
-- employees present themselves.
-- AlterTable
ALTER TABLE "companies" ADD COLUMN "phone" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "email_sender_name" TEXT,
ADD COLUMN "email_reply_to" TEXT;
