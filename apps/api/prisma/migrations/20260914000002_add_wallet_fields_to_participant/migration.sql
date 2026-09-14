-- AlterTable: add USDT wallet fields to escrow_participants for USD escrow payees
ALTER TABLE "escrow_participants" ADD COLUMN "walletAddress" TEXT;
ALTER TABLE "escrow_participants" ADD COLUMN "walletNetwork" TEXT;
