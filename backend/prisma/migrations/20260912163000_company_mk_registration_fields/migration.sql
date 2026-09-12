-- CreateEnum
CREATE TYPE "CompanyLegalForm" AS ENUM ('DOOEL', 'DOO', 'AD', 'TP', 'OTHER');

-- DropIndex
DROP INDEX "companies_tax_id_key";

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "address",
DROP COLUMN "city",
DROP COLUMN "registration_no",
DROP COLUMN "tax_id",
ADD COLUMN     "edb" TEXT NOT NULL,
ADD COLUMN     "embs" TEXT NOT NULL,
ADD COLUMN     "is_vat_payer" BOOLEAN NOT NULL,
ADD COLUMN     "legal_form" "CompanyLegalForm" NOT NULL,
ADD COLUMN     "registered_address" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "companies_embs_key" ON "companies"("embs");

-- CreateIndex
CREATE UNIQUE INDEX "companies_edb_key" ON "companies"("edb");
