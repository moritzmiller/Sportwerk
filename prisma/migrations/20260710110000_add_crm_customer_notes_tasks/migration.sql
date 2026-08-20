CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerTask" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerNote_organizerId_customerEmail_createdAt_idx" ON "CustomerNote"("organizerId", "customerEmail", "createdAt");
CREATE INDEX "CustomerTask_organizerId_customerEmail_completedAt_idx" ON "CustomerTask"("organizerId", "customerEmail", "completedAt");

ALTER TABLE "CustomerNote"
ADD CONSTRAINT "CustomerNote_organizerId_fkey"
FOREIGN KEY ("organizerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTask"
ADD CONSTRAINT "CustomerTask_organizerId_fkey"
FOREIGN KEY ("organizerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
