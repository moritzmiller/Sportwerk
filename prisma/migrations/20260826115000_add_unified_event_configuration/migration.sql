-- Additive migration: move special-event configuration onto the shared Event/Booking/Ticket core.
-- Existing ERICH tables are intentionally left in place until data can be migrated safely.

CREATE TYPE "EventType" AS ENUM ('STANDARD', 'ERICH');

ALTER TABLE "Event"
    ADD COLUMN "eventType" "EventType" NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN "eventOptions" JSONB;

ALTER TABLE "Booking"
    ADD COLUMN "registrationData" JSONB;

ALTER TABLE "Ticket"
    ADD COLUMN "holderDetails" JSONB;

CREATE INDEX "Event_eventType_status_startDate_idx"
    ON "Event"("eventType", "status", "startDate");

CREATE INDEX "Booking_eventId_status_createdAt_idx"
    ON "Booking"("eventId", "status", "createdAt");

CREATE INDEX "Booking_purchaserEmail_createdAt_idx"
    ON "Booking"("purchaserEmail", "createdAt");

CREATE INDEX "Ticket_eventId_ticketNumber_idx"
    ON "Ticket"("eventId", "ticketNumber");
