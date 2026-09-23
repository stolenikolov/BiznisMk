-- Notifications: one company-scoped row per thing worth telling the company
-- about. Rows are persisted first and pushed over the websocket second, so a
-- user who was offline when something happened still finds it waiting.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'ACCOUNT_OUTFLOW',
  'ACCOUNT_INFLOW',
  'INVOICE_DUE',
  'LOAN_INSTALLMENT_DUE',
  'EMPLOYEE_PAYDAY'
);

-- The day of the month salaries are paid on. Nullable: a company that has not
-- set one gets no payday reminders rather than reminders on a guessed date.
-- AlterTable
ALTER TABLE "companies" ADD COLUMN "payday_day_of_month" INTEGER;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "dedupe_key" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- What makes the daily reminder job idempotent: re-running it writes nothing
-- new. Null keys never collide, which is why event-driven rows leave it unset.
-- CreateIndex
CREATE UNIQUE INDEX "notifications_company_id_dedupe_key_key"
  ON "notifications"("company_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_company_id_created_at_idx"
  ON "notifications"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_company_id_is_read_idx"
  ON "notifications"("company_id", "is_read");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
