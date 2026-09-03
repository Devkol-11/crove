-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('Pending', 'Processing', 'Completed', 'Failed', 'Expired');

-- CreateTable payments
CREATE TABLE "payments" (
    "id"               TEXT NOT NULL,
    "escrowId"         TEXT NOT NULL,
    "reference"        TEXT NOT NULL,
    "providerRef"      TEXT,
    "provider"         TEXT NOT NULL,
    "amount"           DECIMAL(15,2) NOT NULL,
    "currency"         TEXT NOT NULL DEFAULT 'NGN',
    "status"           "PaymentStatus" NOT NULL DEFAULT 'Pending',
    "authorizationUrl" TEXT,
    "payerEmail"       TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable inbound_webhooks
CREATE TABLE "inbound_webhooks" (
    "id"          TEXT NOT NULL,
    "provider"    TEXT NOT NULL,
    "eventType"   TEXT NOT NULL,
    "reference"   TEXT NOT NULL,
    "rawPayload"  JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_webhooks_reference_key" ON "inbound_webhooks"("reference");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_escrowId_fkey"
    FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
