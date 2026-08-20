ALTER TABLE "Booking"
    ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "promoCodeId" TEXT,
    ADD COLUMN "promoCode" TEXT;

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" DOUBLE PRECISION,
    "amountOff" DOUBLE PRECISION,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ticketTypeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_eventId_code_key" ON "PromoCode"("eventId", "code");
CREATE INDEX "PromoCode_eventId_active_idx" ON "PromoCode"("eventId", "active");
CREATE INDEX "PromoCode_validFrom_idx" ON "PromoCode"("validFrom");
CREATE INDEX "PromoCode_validUntil_idx" ON "PromoCode"("validUntil");
CREATE INDEX "Booking_promoCodeId_idx" ON "Booking"("promoCodeId");

ALTER TABLE "PromoCode"
    ADD CONSTRAINT "PromoCode_eventId_fkey"
    FOREIGN KEY ("eventId")
    REFERENCES "Event"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId")
    REFERENCES "PromoCode"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
