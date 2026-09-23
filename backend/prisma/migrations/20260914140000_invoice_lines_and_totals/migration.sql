-- Fleshes out the invoice stub: per-year numbering, client details, frozen
-- totals, and line items.
--
-- The new NOT NULL columns are added with a temporary DEFAULT which is then
-- dropped, so the migration applies cleanly whether or not the table already
-- holds rows. New invoices always supply every value explicitly.

-- AlterTable
ALTER TABLE "invoices"
    ADD COLUMN "year"           INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    ADD COLUMN "sequence"       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "client_address" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "client_edb"     TEXT,
    ADD COLUMN "net_amount"     DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "vat_amount"     DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "vat_applied"    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "notes"          TEXT;

ALTER TABLE "invoices"
    ALTER COLUMN "year"           DROP DEFAULT,
    ALTER COLUMN "sequence"       DROP DEFAULT,
    ALTER COLUMN "client_address" DROP DEFAULT,
    ALTER COLUMN "net_amount"     DROP DEFAULT,
    ALTER COLUMN "vat_amount"     DROP DEFAULT,
    ALTER COLUMN "vat_applied"    DROP DEFAULT;

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "vat_rate" DECIMAL(5,2),
    "net_amount" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_items_invoice_id_position_key" ON "invoice_line_items"("invoice_id", "position");

-- DropIndex
DROP INDEX "invoices_companyId_idx";

-- CreateIndex
CREATE INDEX "invoices_companyId_issue_date_idx" ON "invoices"("companyId", "issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_year_sequence_key" ON "invoices"("companyId", "year", "sequence");

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
