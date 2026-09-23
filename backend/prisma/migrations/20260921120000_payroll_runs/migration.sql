-- A paid payroll period. One row per company per month, written either by the
-- app's own run or by a PAYROLL_COMPLETED webhook for a run approved at the
-- bank; the unique bank_request_id is what keeps those from doubling up.

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "employee_count" INTEGER NOT NULL,
    "bank_request_id" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_bank_request_id_key" ON "payroll_runs"("bank_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_company_id_period_key" ON "payroll_runs"("company_id", "period");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
