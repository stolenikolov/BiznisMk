-- The schedule: company-defined shift templates, one assignment per employee
-- per day, and a publication record per week.

-- A published week tells the people whose shifts changed.
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SCHEDULE_PUBLISHED';

-- The stub "schedules" table stored free start/end timestamps per row and was
-- never written to by any endpoint. Shifts are now company templates, so it is
-- replaced rather than migrated.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "schedules") THEN
    RAISE EXCEPTION 'schedules is not empty: move its rows to schedule_entries before applying this migration';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_companyId_fkey";
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_employeeId_fkey";

-- DropTable
DROP TABLE "schedules";

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id"),
    -- End before start is a night shift; end equal to start has no length.
    CONSTRAINT "shift_templates_has_length" CHECK ("start_time" <> "end_time")
);

-- CreateTable
CREATE TABLE "schedule_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shift_template_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_weeks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "locked_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "published_snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_weeks_pkey" PRIMARY KEY ("id"),
    -- Weeks run Monday to Sunday; ISODOW 1 is Monday.
    CONSTRAINT "schedule_weeks_start_is_monday" CHECK (EXTRACT(ISODOW FROM "week_start") = 1)
);

-- CreateIndex
CREATE INDEX "shift_templates_company_id_idx" ON "shift_templates"("company_id");

-- CreateIndex
CREATE INDEX "schedule_entries_company_id_date_idx" ON "schedule_entries"("company_id", "date");

-- CreateIndex
CREATE INDEX "schedule_entries_shift_template_id_idx" ON "schedule_entries"("shift_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_entries_employee_id_date_key" ON "schedule_entries"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_weeks_company_id_week_start_key" ON "schedule_weeks"("company_id", "week_start");

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a template leaves the day without a shift instead of a dangling id.
-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_shift_template_id_fkey" FOREIGN KEY ("shift_template_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_weeks" ADD CONSTRAINT "schedule_weeks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
