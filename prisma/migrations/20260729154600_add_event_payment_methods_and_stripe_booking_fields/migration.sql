ALTER TABLE "Event"
    ADD COLUMN "allowedPaymentMethods" "PaymentMethod"[] NOT NULL
    DEFAULT ARRAY['PAYPAL', 'STRIPE', 'INVOICE', 'BANK_TRANSFER']::"PaymentMethod"[];

ALTER TABLE "Booking"
    ADD COLUMN "stripeCheckoutSessionId" TEXT,
    ADD COLUMN "stripePaymentIntentId" TEXT,
    ADD COLUMN "stripeStatus" TEXT;

CREATE UNIQUE INDEX "Booking_stripeCheckoutSessionId_key"
    ON "Booking"("stripeCheckoutSessionId");

CREATE UNIQUE INDEX "Booking_stripePaymentIntentId_key"
    ON "Booking"("stripePaymentIntentId");
