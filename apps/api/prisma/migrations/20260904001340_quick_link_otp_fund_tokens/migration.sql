-- CreateTable
CREATE TABLE "escrow_creation_intents" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_creation_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_action_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "EscrowRole" NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escrow_creation_intents_email_idx" ON "escrow_creation_intents"("email");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_action_tokens_token_key" ON "escrow_action_tokens"("token");

-- CreateIndex
CREATE INDEX "escrow_action_tokens_escrowId_idx" ON "escrow_action_tokens"("escrowId");

-- AddForeignKey
ALTER TABLE "escrow_action_tokens" ADD CONSTRAINT "escrow_action_tokens_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
