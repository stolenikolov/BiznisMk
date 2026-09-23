-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'CLOSED');

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "status" "BankAccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "credit_lines" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "credit_amount" DECIMAL(14,2) NOT NULL,
    "remaining_balance" DECIMAL(14,2) NOT NULL,
    "next_payment_date" TIMESTAMP(3) NOT NULL,
    "installment_amount" DECIMAL(14,2) NOT NULL,
    "total_installments" INTEGER NOT NULL,
    "installments_paid" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_lines_bank_account_id_key" ON "credit_lines"("bank_account_id");

-- AddForeignKey
ALTER TABLE "credit_lines" ADD CONSTRAINT "credit_lines_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
