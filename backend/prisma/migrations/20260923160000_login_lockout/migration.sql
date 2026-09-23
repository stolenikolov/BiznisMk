-- Per-account lockout after repeated wrong passwords, so guesses spread over
-- many IP addresses still run out.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
