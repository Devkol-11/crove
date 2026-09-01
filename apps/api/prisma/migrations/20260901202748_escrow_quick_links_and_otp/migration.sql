-- Recreate EscrowRole enum: remove Creator, rename Buyer→Payer / Seller→Payee.
-- The USING clause converts all existing values in one step — no UPDATE needed.
ALTER TYPE "EscrowRole" RENAME TO "EscrowRole_old";
CREATE TYPE "EscrowRole" AS ENUM ('Payer', 'Payee');
ALTER TABLE "escrow_participants" ALTER COLUMN "role" TYPE "EscrowRole" USING
    CASE "role"::text
        WHEN 'Creator' THEN 'Payer'
        WHEN 'Buyer'   THEN 'Payer'
        WHEN 'Seller'  THEN 'Payee'
        ELSE 'Payer'
    END::"EscrowRole";
DROP TYPE "EscrowRole_old";

-- Make creatorId nullable (quick link escrows have no authenticated creator)
ALTER TABLE "escrows" ALTER COLUMN "creatorId" DROP NOT NULL;

-- Quick link flag and expiry
ALTER TABLE "escrows" ADD COLUMN "isQuickLink" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "escrows" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Display name for non-auth participants
ALTER TABLE "escrow_participants" ADD COLUMN "name" TEXT;

-- OTP table for quick link recipient identity verification
CREATE TABLE "escrow_join_otps" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "escrow_join_otps_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "escrow_join_otps" ADD CONSTRAINT "escrow_join_otps_escrowId_fkey"
    FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
