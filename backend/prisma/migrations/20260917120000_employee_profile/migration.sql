-- Turns the Employee stub into the real team record: contact details, role,
-- gross salary, hire date, vacation balance and the payout account.
--
-- The new columns are required and have no sensible default (nobody's email
-- or IBAN can be guessed), and there has never been an API that wrote to this
-- table. Rather than invent placeholder values, refuse loudly if rows exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "employees") THEN
    RAISE EXCEPTION 'employees is not empty: backfill email, phone, salary, hire_date and iban before applying this migration';
  END IF;
END $$;

-- Status: TERMINATED goes (an employee who leaves is removed), SICK_LEAVE
-- arrives. Postgres cannot drop an enum value, so the type is swapped; the
-- table is empty, so the cast through text cannot hit a missing value.
ALTER TABLE "employees" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "EmployeeStatus" RENAME TO "EmployeeStatus_old";
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SICK_LEAVE');
ALTER TABLE "employees"
  ALTER COLUMN "status" TYPE "EmployeeStatus" USING ("status"::text::"EmployeeStatus");
ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "EmployeeStatus_old";

-- AlterTable
ALTER TABLE "employees"
  DROP COLUMN "position",
  DROP COLUMN "base_salary",
  DROP COLUMN "hired_at",
  ADD COLUMN "photo_url" TEXT,
  ADD COLUMN "email" TEXT NOT NULL,
  ADD COLUMN "phone" TEXT NOT NULL,
  ADD COLUMN "role" "CompanyRole" NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN "salary" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "hire_date" DATE NOT NULL,
  ADD COLUMN "vacation_days_total" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "vacation_days_remaining" INTEGER NOT NULL,
  ADD COLUMN "iban" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_email_key" ON "employees"("companyId", "email");
