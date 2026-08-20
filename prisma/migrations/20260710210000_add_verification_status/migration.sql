DO $$ BEGIN
    CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Organization"
    ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
    ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

ALTER TABLE "Venue"
    ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
    ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

DO $$ BEGIN
    ALTER TABLE "Organization"
        ADD CONSTRAINT "Organization_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Venue"
        ADD CONSTRAINT "Venue_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Organization_verificationStatus_idx" ON "Organization"("verificationStatus");
CREATE INDEX IF NOT EXISTS "Venue_verificationStatus_idx" ON "Venue"("verificationStatus");
