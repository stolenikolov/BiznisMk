-- An IBAN belongs to one company, not one per company: the bank decides whose
-- account it is when it is linked, and its webhooks are routed by IBAN alone.
-- Fails, deliberately, if two companies have already connected the same IBAN;
-- that has to be resolved by hand rather than guessed at.
-- DropIndex
DROP INDEX "bank_accounts_companyId_iban_key";

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_iban_key" ON "bank_accounts"("iban");
