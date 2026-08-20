CREATE TABLE "EventScannerLink" (
    "id" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "lastUserAgent" TEXT,

    CONSTRAINT "EventScannerLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventScannerLink_tokenHash_key" ON "EventScannerLink"("tokenHash");
CREATE INDEX "EventScannerLink_eventId_expiresAt_idx" ON "EventScannerLink"("eventId", "expiresAt");
CREATE INDEX "EventScannerLink_eventId_revokedAt_idx" ON "EventScannerLink"("eventId", "revokedAt");
CREATE INDEX "EventScannerLink_createdById_idx" ON "EventScannerLink"("createdById");

ALTER TABLE "EventScannerLink"
    ADD CONSTRAINT "EventScannerLink_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventScannerLink"
    ADD CONSTRAINT "EventScannerLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
