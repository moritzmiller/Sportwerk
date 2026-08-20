ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "ticketTypeId" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "ticketTypeName" TEXT;

CREATE TABLE IF NOT EXISTS "EventTicketType" (
    "id" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "quota" INTEGER,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "maxPerBooking" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTicketType_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'Booking_ticketTypeId_fkey'
    ) THEN
        ALTER TABLE "Booking"
            ADD CONSTRAINT "Booking_ticketTypeId_fkey"
            FOREIGN KEY ("ticketTypeId")
            REFERENCES "EventTicketType"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'EventTicketType_eventId_fkey'
    ) THEN
        ALTER TABLE "EventTicketType"
            ADD CONSTRAINT "EventTicketType_eventId_fkey"
            FOREIGN KEY ("eventId")
            REFERENCES "Event"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EventTicketType_eventId_sortOrder_idx" ON "EventTicketType"("eventId", "sortOrder");
CREATE INDEX IF NOT EXISTS "EventTicketType_eventId_isDefault_idx" ON "EventTicketType"("eventId", "isDefault");
CREATE INDEX IF NOT EXISTS "Booking_ticketTypeId_idx" ON "Booking"("ticketTypeId");
