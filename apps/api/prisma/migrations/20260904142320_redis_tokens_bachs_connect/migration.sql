/*
  Warnings:

  - You are about to drop the `escrow_action_tokens` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `escrow_creation_intents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `escrow_join_otps` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "escrow_action_tokens" DROP CONSTRAINT "escrow_action_tokens_escrowId_fkey";

-- DropForeignKey
ALTER TABLE "escrow_join_otps" DROP CONSTRAINT "escrow_join_otps_escrowId_fkey";

-- AlterTable
ALTER TABLE "escrow_participants" ADD COLUMN     "bachsAccountId" TEXT;

-- DropTable
DROP TABLE "escrow_action_tokens";

-- DropTable
DROP TABLE "escrow_creation_intents";

-- DropTable
DROP TABLE "escrow_join_otps";
