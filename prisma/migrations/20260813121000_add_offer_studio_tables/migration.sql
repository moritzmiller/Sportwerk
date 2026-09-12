CREATE TYPE "OfferAdjustmentType" AS ENUM ('DISCOUNT', 'SURCHARGE');

CREATE TYPE "OfferItemType" AS ENUM ('HEADING', 'SEPARATOR', 'FLAT', 'DETAIL');

CREATE TABLE "OfferCustomer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferCompanyProfile" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "representedBy" TEXT,
    "logo" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "bankName" TEXT,
    "bic" TEXT,
    "accountHolder" TEXT,
    "iban" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferCompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "customerId" TEXT,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "note" TEXT,
    "showItemDetails" BOOLEAN NOT NULL DEFAULT true,
    "adjustmentType" "OfferAdjustmentType" NOT NULL DEFAULT 'DISCOUNT',
    "adjustmentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companySnapshot" JSONB NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "legalSnapshot" JSONB NOT NULL,
    "totals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "OfferItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 19,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferCompanyProfile_ownerId_key" ON "OfferCompanyProfile"("ownerId");
CREATE UNIQUE INDEX "Offer_ownerId_number_key" ON "Offer"("ownerId", "number");

CREATE INDEX "OfferCustomer_ownerId_name_idx" ON "OfferCustomer"("ownerId", "name");
CREATE INDEX "OfferCustomer_ownerId_email_idx" ON "OfferCustomer"("ownerId", "email");
CREATE INDEX "OfferCustomer_ownerId_createdAt_idx" ON "OfferCustomer"("ownerId", "createdAt");
CREATE INDEX "Offer_ownerId_updatedAt_idx" ON "Offer"("ownerId", "updatedAt");
CREATE INDEX "Offer_ownerId_date_idx" ON "Offer"("ownerId", "date");
CREATE INDEX "Offer_customerId_idx" ON "Offer"("customerId");
CREATE INDEX "OfferItem_offerId_sortOrder_idx" ON "OfferItem"("offerId", "sortOrder");

ALTER TABLE "OfferCustomer"
ADD CONSTRAINT "OfferCustomer_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferCompanyProfile"
ADD CONSTRAINT "OfferCompanyProfile_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Offer"
ADD CONSTRAINT "Offer_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Offer"
ADD CONSTRAINT "Offer_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "OfferCustomer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfferItem"
ADD CONSTRAINT "OfferItem_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "Offer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
