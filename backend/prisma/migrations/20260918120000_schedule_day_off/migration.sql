-- A day can be marked as deliberately free ("Слободен/на"), which employees
-- are told about, instead of only ever being "not planned yet".
-- AlterTable
ALTER TABLE "schedule_entries" ADD COLUMN "day_off" BOOLEAN NOT NULL DEFAULT false;

-- A day off is not a shift: it never points at a template.
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_day_off_has_no_shift"
  CHECK (NOT ("day_off" AND "shift_template_id" IS NOT NULL));
