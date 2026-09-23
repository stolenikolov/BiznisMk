-- Invoices now point in two directions: OUTGOING is one we issued, INCOMING is
-- a supplier bill we owe. Marking either paid moves real money, in opposite
-- directions, so the settlement is recorded on the invoice itself.

-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('OUTGOING', 'INCOMING');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "direction" "InvoiceDirection" NOT NULL DEFAULT 'OUTGOING';

-- An INCOMING bill carries the supplier's own number and must never consume a
-- number out of our sequence, so the counter columns become optional.
ALTER TABLE "invoices" ALTER COLUMN "year" DROP NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "sequence" DROP NOT NULL;

-- Where the money landed (or came from) when the invoice was settled.
ALTER TABLE "invoices" ADD COLUMN "settled_account_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "settled_transaction_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "settled_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_settled_transaction_id_key"
  ON "invoices"("settled_transaction_id");
