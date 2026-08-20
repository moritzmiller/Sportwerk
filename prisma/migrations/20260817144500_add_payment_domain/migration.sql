-- Provider-independent payment domain for Gatekeeper.
-- Existing Booking provider fields stay in place for backwards compatibility while the
-- checkout and webhook code can move to this domain incrementally.

CREATE TYPE "PaymentProvider" AS ENUM (
    'STRIPE',
    'PAYPAL',
    'MOLLIE',
    'ADYEN',
    'GOCARDLESS',
    'MANUAL',
    'FREE'
);

CREATE TYPE "PaymentStatus" AS ENUM (
    'PENDING',
    'REQUIRES_ACTION',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
    'CHARGED_BACK'
);

CREATE TYPE "PaymentLedgerEntryType" AS ENUM (
    'GROSS_PAYMENT',
    'PROVIDER_FEE',
    'GATEKEEPER_FEE',
    'ORGANIZER_NET',
    'REFUND',
    'REFUND_FEE',
    'CHARGEBACK',
    'ADJUSTMENT'
);

CREATE TYPE "LedgerDirection" AS ENUM (
    'CREDIT',
    'DEBIT'
);

CREATE TYPE "WebhookStatus" AS ENUM (
    'RECEIVED',
    'PROCESSED',
    'IGNORED',
    'FAILED'
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerPaymentId" TEXT,
    "providerCheckoutId" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "idempotencyKey" TEXT NOT NULL,
    "providerPayload" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentLedgerEntry" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "PaymentLedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "processingResult" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");
CREATE UNIQUE INDEX "Payment_provider_providerCheckoutId_key" ON "Payment"("provider", "providerCheckoutId");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_bookingId_status_idx" ON "Payment"("bookingId", "status");
CREATE INDEX "Payment_provider_status_idx" ON "Payment"("provider", "status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

CREATE INDEX "PaymentLedgerEntry_paymentId_createdAt_idx" ON "PaymentLedgerEntry"("paymentId", "createdAt");
CREATE INDEX "PaymentLedgerEntry_bookingId_createdAt_idx" ON "PaymentLedgerEntry"("bookingId", "createdAt");
CREATE INDEX "PaymentLedgerEntry_type_idx" ON "PaymentLedgerEntry"("type");
CREATE INDEX "PaymentLedgerEntry_referenceType_referenceId_idx" ON "PaymentLedgerEntry"("referenceType", "referenceId");

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");
CREATE INDEX "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");
CREATE INDEX "PaymentWebhookEvent_provider_status_createdAt_idx" ON "PaymentWebhookEvent"("provider", "status", "createdAt");

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentLedgerEntry"
    ADD CONSTRAINT "PaymentLedgerEntry_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent"
    ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
