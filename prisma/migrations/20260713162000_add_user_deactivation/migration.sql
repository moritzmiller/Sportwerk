ALTER TABLE "User"
    ADD COLUMN "disabledAt" TIMESTAMP(3),
    ADD COLUMN "disabledById" TEXT,
    ADD COLUMN "disabledReason" TEXT;

CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");
