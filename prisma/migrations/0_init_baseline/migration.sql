-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VISITOR', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('KONZERT', 'PARTY', 'KULTUR', 'SPORT', 'FAMILIE', 'WORKSHOP', 'MARKT', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYPAL', 'INVOICE', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'POSTPONED', 'SOLD_OUT');

-- CreateTable
CREATE TABLE "User" (
                        "id" TEXT NOT NULL,
                        "email" TEXT NOT NULL,
                        "name" TEXT,
                        "paypalEmail" TEXT,
                        "billingName" TEXT,
                        "billingStreet" TEXT,
                        "billingStreet2" TEXT,
                        "billingPostalCode" TEXT,
                        "billingCity" TEXT,
                        "billingCountry" TEXT NOT NULL DEFAULT 'DE',
                        "preferredPaymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PAYPAL',
                        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        "role" "Role" NOT NULL DEFAULT 'VISITOR',

                        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
                         "id" SERIAL NOT NULL,
                         "title" TEXT NOT NULL,
                         "description" TEXT,
                         "imageUrl" TEXT,
                         "location" TEXT NOT NULL,
                         "city" TEXT NOT NULL DEFAULT 'Dresden',
                         "category" "Category" NOT NULL DEFAULT 'SONSTIGES',
                         "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED',
                         "startDate" TIMESTAMP(3) NOT NULL,
                         "price" DOUBLE PRECISION NOT NULL,
                         "capacity" INTEGER,
                         "soldTickets" INTEGER NOT NULL DEFAULT 0,
                         "viewCount" INTEGER NOT NULL DEFAULT 0,
                         "publishedAt" TIMESTAMP(3),
                         "cancelledAt" TIMESTAMP(3),
                         "cancellationReason" TEXT,
                         "duplicateOfId" INTEGER,
                         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                         "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                         "ownerId" TEXT NOT NULL,

                         CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
                           "id" TEXT NOT NULL,
                           "eventId" INTEGER NOT NULL,
                           "attendeeId" TEXT,
                           "purchaserName" TEXT NOT NULL,
                           "purchaserEmail" TEXT NOT NULL,
                           "purchaserPhone" TEXT,
                           "notes" TEXT,
                           "newsletter" BOOLEAN NOT NULL DEFAULT false,
                           "quantity" INTEGER NOT NULL DEFAULT 1,
                           "currency" TEXT NOT NULL DEFAULT 'EUR',
                           "unitPrice" DOUBLE PRECISION NOT NULL,
                           "serviceFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
                           "totalAmount" DOUBLE PRECISION NOT NULL,
                           "billingName" TEXT,
                           "billingStreet" TEXT,
                           "billingStreet2" TEXT,
                           "billingPostalCode" TEXT,
                           "billingCity" TEXT,
                           "billingCountry" TEXT NOT NULL DEFAULT 'DE',
                           "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PAYPAL',
                           "status" "BookingStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
                           "paymentProvider" TEXT NOT NULL DEFAULT 'PAYPAL',
                           "paymentReference" TEXT,
                           "paidAt" TIMESTAMP(3),
                           "paymentReminderCount" INTEGER NOT NULL DEFAULT 0,
                           "lastPaymentReminderAt" TIMESTAMP(3),
                           "paymentCancelledAt" TIMESTAMP(3),
                           "paymentCancellationReason" TEXT,
                           "checkedInAt" TIMESTAMP(3),
                           "checkedInById" TEXT,
                           "checkedInVia" TEXT,
                           "transferToName" TEXT,
                           "transferToEmail" TEXT,
                           "paypalOrderId" TEXT,
                           "paypalCaptureId" TEXT,
                           "paypalApprovalUrl" TEXT,
                           "paypalStatus" TEXT,
                           "providerPayload" JSONB,
                           "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                           "updatedAt" TIMESTAMP(3) NOT NULL,

                           CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFavorite" (
                                 "id" TEXT NOT NULL,
                                 "userId" TEXT NOT NULL,
                                 "eventId" INTEGER NOT NULL,
                                 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                 CONSTRAINT "EventFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventView" (
                             "id" TEXT NOT NULL,
                             "userId" TEXT,
                             "eventId" INTEGER NOT NULL,
                             "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                             "source" TEXT,
                             "referrer" TEXT,

                             CONSTRAINT "EventView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAlert" (
                              "id" TEXT NOT NULL,
                              "userId" TEXT NOT NULL,
                              "eventId" INTEGER,
                              "query" TEXT,
                              "city" TEXT,
                              "category" "Category",
                              "active" BOOLEAN NOT NULL DEFAULT true,
                              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              "updatedAt" TIMESTAMP(3) NOT NULL,

                              CONSTRAINT "EventAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAuditLog" (
                                 "id" TEXT NOT NULL,
                                 "eventId" INTEGER,
                                 "actorId" TEXT,
                                 "action" TEXT NOT NULL,
                                 "details" JSONB,
                                 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                 CONSTRAINT "EventAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Event_ownerId_idx" ON "Event"("ownerId");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_startDate_idx" ON "Event"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paypalOrderId_key" ON "Booking"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_paypalCaptureId_key" ON "Booking"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "Booking_eventId_idx" ON "Booking"("eventId");

-- CreateIndex
CREATE INDEX "Booking_attendeeId_idx" ON "Booking"("attendeeId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_checkedInAt_idx" ON "Booking"("checkedInAt");

-- CreateIndex
CREATE INDEX "EventFavorite_eventId_idx" ON "EventFavorite"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFavorite_userId_eventId_key" ON "EventFavorite"("userId", "eventId");

-- CreateIndex
CREATE INDEX "EventView_eventId_idx" ON "EventView"("eventId");

-- CreateIndex
CREATE INDEX "EventView_userId_idx" ON "EventView"("userId");

-- CreateIndex
CREATE INDEX "EventView_viewedAt_idx" ON "EventView"("viewedAt");

-- CreateIndex
CREATE INDEX "EventAlert_userId_idx" ON "EventAlert"("userId");

-- CreateIndex
CREATE INDEX "EventAlert_eventId_idx" ON "EventAlert"("eventId");

-- CreateIndex
CREATE INDEX "EventAlert_active_idx" ON "EventAlert"("active");

-- CreateIndex
CREATE INDEX "EventAuditLog_eventId_idx" ON "EventAuditLog"("eventId");

-- CreateIndex
CREATE INDEX "EventAuditLog_actorId_idx" ON "EventAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "EventAuditLog_createdAt_idx" ON "EventAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFavorite" ADD CONSTRAINT "EventFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFavorite" ADD CONSTRAINT "EventFavorite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventView" ADD CONSTRAINT "EventView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventView" ADD CONSTRAINT "EventView_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAlert" ADD CONSTRAINT "EventAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAlert" ADD CONSTRAINT "EventAlert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

