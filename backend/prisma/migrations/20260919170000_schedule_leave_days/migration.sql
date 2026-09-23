-- A planned day of holiday or sick leave in the schedule grid, set per day by
-- the manager, as opposed to the employee's undated status.
-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ON_LEAVE', 'SICK_LEAVE');

-- AlterTable
ALTER TABLE "schedule_entries" ADD COLUMN     "leave" "LeaveType";

-- A day away is neither a shift nor a day off.
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_leave_stands_alone"
  CHECK ("leave" IS NULL OR ("shift_template_id" IS NULL AND NOT "day_off"));
