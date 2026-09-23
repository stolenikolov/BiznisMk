-- A run pays more than the employees: the contributions and income tax
-- withheld from the same gross are transfers of their own. The column counts
-- transfers, so it is no longer a headcount.

-- AlterTable
ALTER TABLE "payroll_runs" RENAME COLUMN "employee_count" TO "payment_count";
