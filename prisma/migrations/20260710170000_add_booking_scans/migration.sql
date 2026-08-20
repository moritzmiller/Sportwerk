-- CreateTable
CREATE TABLE "BookingScan" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "eventId" INTEGER,
    "scannerId" TEXT,
    "scannerEmail" TEXT,
    "scannerName" TEXT,
    "source" TEXT,
    "rawInput" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "warning" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingScan_bookingId_createdAt_idx" ON "BookingScan"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingScan_eventId_createdAt_idx" ON "BookingScan"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingScan_scannerId_createdAt_idx" ON "BookingScan"("scannerId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingScan_status_createdAt_idx" ON "BookingScan"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BookingScan" ADD CONSTRAINT "BookingScan_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingScan" ADD CONSTRAINT "BookingScan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingScan" ADD CONSTRAINT "BookingScan_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
