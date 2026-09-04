-- DropForeignKey
ALTER TABLE "escrows" DROP CONSTRAINT "escrows_creatorId_fkey";

-- AlterTable
ALTER TABLE "escrow_participants" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "bankName" TEXT;

-- CreateIndex
CREATE INDEX "escrow_transactions_providerRef_idx" ON "escrow_transactions"("providerRef");

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
