-- Transactions that arrive from the bank carry the bank's own id. Webhook
-- deliveries are retried until acknowledged, so without this a slow response
-- would book the same deposit twice.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "external_id" TEXT;

-- Scoped to the account rather than global: two banks may well issue the same
-- id, and the ids are only ever compared within one account. Rows we booked
-- ourselves leave it null, and Postgres treats nulls as distinct, so any
-- number of them coexist.
-- CreateIndex
CREATE UNIQUE INDEX "transactions_bank_account_id_external_id_key"
  ON "transactions"("bank_account_id", "external_id");
