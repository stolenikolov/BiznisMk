-- The company a signed-in session is working in, so that rotating its refresh
-- token keeps a multi-company user in the company they picked. Closing the
-- company clears it rather than deleting the session.
-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "companyId" TEXT;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
