-- CreateEnum
CREATE TYPE "EventInteractionType" AS ENUM (
    'VIEW',
    'CLICK',
    'FAVORITE',
    'UNFAVORITE',
    'BOOKING',
    'ALERT',
    'SHARE',
    'HIDE',
    'DWELL'
);

-- CreateEnum
CREATE TYPE "RecommendationPreferenceScope" AS ENUM (
    'CATEGORY',
    'CITY',
    'LOCATION',
    'PRICE_BAND',
    'TIME_SLOT',
    'ORGANIZATION',
    'VENUE'
);

-- CreateTable
CREATE TABLE "EventImpression" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventId" INTEGER NOT NULL,
    "feedSessionId" TEXT,
    "source" TEXT,
    "position" INTEGER,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImpression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventId" INTEGER NOT NULL,
    "type" "EventInteractionType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEventPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "RecommendationPreferenceScope" NOT NULL,
    "target" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "lastSignalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEventPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventImpression_userId_createdAt_idx" ON "EventImpression"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EventImpression_eventId_createdAt_idx" ON "EventImpression"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventImpression_feedSessionId_idx" ON "EventImpression"("feedSessionId");

-- CreateIndex
CREATE INDEX "EventInteraction_userId_createdAt_idx" ON "EventInteraction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EventInteraction_eventId_createdAt_idx" ON "EventInteraction"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventInteraction_type_createdAt_idx" ON "EventInteraction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserEventPreference_userId_scope_target_key" ON "UserEventPreference"("userId", "scope", "target");

-- CreateIndex
CREATE INDEX "UserEventPreference_userId_scope_weight_idx" ON "UserEventPreference"("userId", "scope", "weight");

-- CreateIndex
CREATE INDEX "UserEventPreference_lastSignalAt_idx" ON "UserEventPreference"("lastSignalAt");

-- AddForeignKey
ALTER TABLE "EventImpression" ADD CONSTRAINT "EventImpression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventImpression" ADD CONSTRAINT "EventImpression_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInteraction" ADD CONSTRAINT "EventInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInteraction" ADD CONSTRAINT "EventInteraction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventPreference" ADD CONSTRAINT "UserEventPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
