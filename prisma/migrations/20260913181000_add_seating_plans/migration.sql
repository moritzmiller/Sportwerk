CREATE TYPE "SeatingPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "SeatingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layout" JSONB NOT NULL,
    "seatCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SeatingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "venueId" TEXT NOT NULL,
    "organizationId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Event"
ADD COLUMN "seatingPlanId" TEXT;

CREATE INDEX "SeatingPlan_venueId_idx" ON "SeatingPlan"("venueId");
CREATE INDEX "SeatingPlan_organizationId_idx" ON "SeatingPlan"("organizationId");
CREATE INDEX "SeatingPlan_ownerId_idx" ON "SeatingPlan"("ownerId");
CREATE INDEX "SeatingPlan_status_idx" ON "SeatingPlan"("status");
CREATE INDEX "Event_seatingPlanId_idx" ON "Event"("seatingPlanId");

ALTER TABLE "SeatingPlan"
ADD CONSTRAINT "SeatingPlan_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeatingPlan"
ADD CONSTRAINT "SeatingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SeatingPlan"
ADD CONSTRAINT "SeatingPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event"
ADD CONSTRAINT "Event_seatingPlanId_fkey" FOREIGN KEY ("seatingPlanId") REFERENCES "SeatingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
