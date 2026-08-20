-- CreateEnum
CREATE TYPE "ErichEventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ErichRole" AS ENUM ('USER', 'ADMIN', 'REGISTRATION_OFFICE', 'SCANNER');

-- CreateEnum
CREATE TYPE "ErichValuationLevel" AS ENUM ('ERICH', 'DM', 'MDM');

-- CreateEnum
CREATE TYPE "ErichRaceGender" AS ENUM ('MALE', 'FEMALE', 'MIXED');

-- CreateEnum
CREATE TYPE "ErichRaceStatus" AS ENUM ('ACTIVE', 'REVIEW_REQUIRED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ErichRegistrationStatus" AS ENUM ('TEMPORARY', 'CHECKOUT', 'PAID', 'INVALID', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ErichPaymentStatus" AS ENUM ('OPEN', 'CHECKOUT_ACTIVE', 'PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED', 'CHARGED_BACK', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ErichEligibilityStatus" AS ENUM ('NOT_REQUIRED', 'UNCHECKED', 'PENDING_IMPORT', 'AUTO_CONFIRMED', 'MANUAL_REVIEW', 'MANUAL_CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ErichRaceEntryStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'REBOOKED', 'NOT_ELIGIBLE', 'FINISHED');

-- CreateEnum
CREATE TYPE "ErichTeamEntryStatus" AS ENUM ('TEMPORARY', 'ACTIVE', 'CANCELLED', 'REBOOKED', 'NOT_ELIGIBLE', 'FINISHED');

-- CreateEnum
CREATE TYPE "ErichTicketStatus" AS ENUM ('ACTIVE', 'REPLACED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ErichDocumentIssueStatus" AS ENUM ('NOT_PREPARED', 'PREPARED', 'ISSUED');

-- CreateEnum
CREATE TYPE "ErichImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'DRY_RUN_OK', 'DRY_RUN_FAILED', 'APPLIED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "ErichEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "status" "ErichEventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRoleAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ErichRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichChampionship" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "level" "ErichValuationLevel" NOT NULL,
    "nameDe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ErichChampionship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichClub" (
    "id" TEXT NOT NULL,
    "externalFederationId" TEXT,
    "officialName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "federalState" TEXT,
    "stateRowingAssociation" TEXT,
    "stateAssociationMember" BOOLEAN NOT NULL DEFAULT false,
    "isGermanClub" BOOLEAN NOT NULL DEFAULT false,
    "isCentralGermanClub" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "sourceImportId" TEXT,
    "sourceRow" JSONB,
    "searchText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichClubImport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fileAssetId" TEXT,
    "status" "ErichImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "originalFileName" TEXT,
    "importedAt" TIMESTAMP(3),
    "importedById" TEXT,
    "validationReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichClubImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRaceDefinition" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "raceNumber" INTEGER NOT NULL,
    "gender" "ErichRaceGender",
    "classLabel" TEXT,
    "distanceLabel" TEXT,
    "includesErich" BOOLEAN NOT NULL DEFAULT false,
    "includesDm" BOOLEAN NOT NULL DEFAULT false,
    "includesMdm" BOOLEAN NOT NULL DEFAULT false,
    "isLightweight" BOOLEAN NOT NULL DEFAULT false,
    "isPara" BOOLEAN NOT NULL DEFAULT false,
    "isTeamRace" BOOLEAN NOT NULL DEFAULT false,
    "requiredTeamSize" INTEGER,
    "sameClubRequired" BOOLEAN,
    "mixedClubsAllowed" BOOLEAN,
    "maleCount" INTEGER,
    "femaleCount" INTEGER,
    "minimumBirthYear" INTEGER,
    "maximumBirthYear" INTEGER,
    "higherAgeClassAllowed" BOOLEAN NOT NULL DEFAULT false,
    "higherAgeMinimumBirthYear" INTEGER,
    "fallbackRaceId" TEXT,
    "status" "ErichRaceStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "reviewReason" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichRaceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRaceVersion" (
    "id" TEXT NOT NULL,
    "raceDefinitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichRaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRaceEligibilityRule" (
    "id" TEXT NOT NULL,
    "raceDefinitionId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleConfig" JSONB NOT NULL,
    "explanationDe" TEXT,
    "explanationEn" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichRaceEligibilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichPricePhase" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichPricePhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRacePrice" (
    "id" TEXT NOT NULL,
    "raceDefinitionId" TEXT NOT NULL,
    "pricePhaseId" TEXT NOT NULL,
    "valuationLevel" "ErichValuationLevel" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichRacePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichAthlete" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "ErichRaceGender" NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "nationalityCode" TEXT NOT NULL,
    "email" TEXT,
    "lightweight" BOOLEAN NOT NULL DEFAULT false,
    "parasport" BOOLEAN NOT NULL DEFAULT false,
    "germanLicenseNumber" TEXT,
    "portraitFileAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichAthlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichTrainer" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clubId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationalityCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRegistrationBatch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "ErichRegistrationStatus" NOT NULL DEFAULT 'TEMPORARY',
    "expiresAt" TIMESTAMP(3),
    "checkoutExpiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichRegistrationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRaceEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationBatchId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "raceDefinitionId" TEXT NOT NULL,
    "raceNumber" INTEGER NOT NULL,
    "targetTimeMinutes" INTEGER NOT NULL,
    "targetTimeSeconds" INTEGER NOT NULL,
    "targetTimeMilliseconds" INTEGER NOT NULL,
    "targetTimeTotalMs" INTEGER NOT NULL,
    "status" "ErichRaceEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichRaceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRaceEntryValuation" (
    "id" TEXT NOT NULL,
    "raceEntryId" TEXT NOT NULL,
    "level" "ErichValuationLevel" NOT NULL,
    "status" "ErichEligibilityStatus" NOT NULL,
    "dependsOnLicenseCheck" BOOLEAN NOT NULL DEFAULT false,
    "decisionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichRaceEntryValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichTeamEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationBatchId" TEXT NOT NULL,
    "raceDefinitionId" TEXT NOT NULL,
    "raceNumber" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "status" "ErichTeamEntryStatus" NOT NULL DEFAULT 'TEMPORARY',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichTeamEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichTeamMember" (
    "id" TEXT NOT NULL,
    "teamEntryId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichBillingProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "registrationBatchId" TEXT,
    "recipient" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "invoiceEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichPayment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationBatchId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "ErichPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichPaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAttemptId" TEXT,
    "paymentMethod" TEXT,
    "status" "ErichPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichPaymentWebhook" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichPaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichInvoice" (
    "id" TEXT NOT NULL,
    "registrationBatchId" TEXT NOT NULL,
    "billingProfileId" TEXT NOT NULL,
    "paymentId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "totalNetCents" INTEGER NOT NULL,
    "totalTaxCents" INTEGER NOT NULL,
    "totalGrossCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "pdfFileAssetId" TEXT,
    "immutableSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "raceEntryId" TEXT,
    "teamEntryId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitGrossCents" INTEGER NOT NULL,
    "totalGrossCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichCreditNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reason" TEXT NOT NULL,
    "pdfFileAssetId" TEXT,
    "immutableSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichRefundCase" (
    "id" TEXT NOT NULL,
    "registrationBatchId" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" TEXT NOT NULL,
    "requestedAmountCents" INTEGER NOT NULL,
    "approvedAmountCents" INTEGER,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichRefundCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichLicenseImport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fileAssetId" TEXT,
    "status" "ErichImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "sheetName" TEXT,
    "columnMapping" JSONB,
    "validationReport" JSONB,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichLicenseImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichLicenseRecord" (
    "id" TEXT NOT NULL,
    "licenseImportId" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthDate" TIMESTAMP(3),
    "clubName" TEXT,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichLicenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichEligibilityDecision" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "raceEntryId" TEXT,
    "licenseImportId" TEXT,
    "status" "ErichEligibilityStatus" NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "decisionData" JSONB,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichEligibilityDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichTicket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "athleteId" TEXT,
    "trainerId" TEXT,
    "raceEntryId" TEXT,
    "teamEntryId" TEXT,
    "status" "ErichTicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichTicketReplacement" (
    "id" TEXT NOT NULL,
    "oldTicketId" TEXT NOT NULL,
    "newTicketId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichTicketReplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichCheckIn" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "warning" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannerId" TEXT,
    "deviceId" TEXT,
    "offlineId" TEXT,
    "syncStatus" TEXT,
    "details" JSONB,

    CONSTRAINT "ErichCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichDocumentIssue" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "ErichDocumentIssueStatus" NOT NULL DEFAULT 'NOT_PREPARED',
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichDocumentIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichScheduleAssignment" (
    "id" TEXT NOT NULL,
    "raceEntryId" TEXT,
    "teamEntryId" TEXT,
    "raceNumber" INTEGER NOT NULL,
    "runLabel" TEXT,
    "startTime" TIMESTAMP(3),
    "ergometerNumber" TEXT,
    "startPlace" TEXT,
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichConsentDocument" (
    "id" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichConsentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichConsentAcceptance" (
    "id" TEXT NOT NULL,
    "consentDocumentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "athleteId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT NOT NULL,
    "proofData" JSONB,

    CONSTRAINT "ErichConsentAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichEmailMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "registrationBatchId" TEXT,
    "templateKey" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ErichEmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichImportJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "status" "ErichImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "fileAssetId" TEXT,
    "createdById" TEXT,
    "dryRunReport" JSONB,
    "appliedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichExportJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "filters" JSONB,
    "version" INTEGER NOT NULL,
    "checksum" TEXT,
    "fileAssetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichAuditLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichFileAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErichFileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErichSystemConfiguration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErichSystemConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErichEvent_slug_key" ON "ErichEvent"("slug");

-- CreateIndex
CREATE INDEX "ErichEvent_status_idx" ON "ErichEvent"("status");

-- CreateIndex
CREATE INDEX "ErichEvent_startsAt_idx" ON "ErichEvent"("startsAt");

-- CreateIndex
CREATE INDEX "ErichRoleAssignment_userId_role_idx" ON "ErichRoleAssignment"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ErichRoleAssignment_eventId_userId_role_key" ON "ErichRoleAssignment"("eventId", "userId", "role");

-- CreateIndex
CREATE INDEX "ErichChampionship_eventId_sortOrder_idx" ON "ErichChampionship"("eventId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ErichChampionship_eventId_level_key" ON "ErichChampionship"("eventId", "level");

-- CreateIndex
CREATE INDEX "ErichClub_officialName_idx" ON "ErichClub"("officialName");

-- CreateIndex
CREATE INDEX "ErichClub_countryCode_active_idx" ON "ErichClub"("countryCode", "active");

-- CreateIndex
CREATE INDEX "ErichClub_isGermanClub_stateAssociationMember_idx" ON "ErichClub"("isGermanClub", "stateAssociationMember");

-- CreateIndex
CREATE INDEX "ErichClub_isCentralGermanClub_stateAssociationMember_idx" ON "ErichClub"("isCentralGermanClub", "stateAssociationMember");

-- CreateIndex
CREATE INDEX "ErichClubImport_eventId_createdAt_idx" ON "ErichClubImport"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichClubImport_status_idx" ON "ErichClubImport"("status");

-- CreateIndex
CREATE INDEX "ErichRaceDefinition_eventId_status_idx" ON "ErichRaceDefinition"("eventId", "status");

-- CreateIndex
CREATE INDEX "ErichRaceDefinition_raceNumber_idx" ON "ErichRaceDefinition"("raceNumber");

-- CreateIndex
CREATE INDEX "ErichRaceDefinition_gender_idx" ON "ErichRaceDefinition"("gender");

-- CreateIndex
CREATE UNIQUE INDEX "ErichRaceDefinition_eventId_raceNumber_key" ON "ErichRaceDefinition"("eventId", "raceNumber");

-- CreateIndex
CREATE INDEX "ErichRaceVersion_createdAt_idx" ON "ErichRaceVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErichRaceVersion_raceDefinitionId_version_key" ON "ErichRaceVersion"("raceDefinitionId", "version");

-- CreateIndex
CREATE INDEX "ErichRaceEligibilityRule_raceDefinitionId_active_idx" ON "ErichRaceEligibilityRule"("raceDefinitionId", "active");

-- CreateIndex
CREATE INDEX "ErichRaceEligibilityRule_ruleType_idx" ON "ErichRaceEligibilityRule"("ruleType");

-- CreateIndex
CREATE INDEX "ErichPricePhase_eventId_sortOrder_idx" ON "ErichPricePhase"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "ErichPricePhase_active_idx" ON "ErichPricePhase"("active");

-- CreateIndex
CREATE UNIQUE INDEX "ErichPricePhase_eventId_name_key" ON "ErichPricePhase"("eventId", "name");

-- CreateIndex
CREATE INDEX "ErichRacePrice_pricePhaseId_idx" ON "ErichRacePrice"("pricePhaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichRacePrice_raceDefinitionId_pricePhaseId_valuationLevel_key" ON "ErichRacePrice"("raceDefinitionId", "pricePhaseId", "valuationLevel");

-- CreateIndex
CREATE INDEX "ErichAthlete_accountId_idx" ON "ErichAthlete"("accountId");

-- CreateIndex
CREATE INDEX "ErichAthlete_clubId_idx" ON "ErichAthlete"("clubId");

-- CreateIndex
CREATE INDEX "ErichAthlete_birthYear_idx" ON "ErichAthlete"("birthYear");

-- CreateIndex
CREATE INDEX "ErichAthlete_lastName_firstName_idx" ON "ErichAthlete"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "ErichAthlete_germanLicenseNumber_idx" ON "ErichAthlete"("germanLicenseNumber");

-- CreateIndex
CREATE INDEX "ErichTrainer_accountId_idx" ON "ErichTrainer"("accountId");

-- CreateIndex
CREATE INDEX "ErichTrainer_clubId_idx" ON "ErichTrainer"("clubId");

-- CreateIndex
CREATE INDEX "ErichTrainer_lastName_firstName_idx" ON "ErichTrainer"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "ErichRegistrationBatch_eventId_status_idx" ON "ErichRegistrationBatch"("eventId", "status");

-- CreateIndex
CREATE INDEX "ErichRegistrationBatch_accountId_createdAt_idx" ON "ErichRegistrationBatch"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichRaceEntry_registrationBatchId_idx" ON "ErichRaceEntry"("registrationBatchId");

-- CreateIndex
CREATE INDEX "ErichRaceEntry_eventId_raceNumber_idx" ON "ErichRaceEntry"("eventId", "raceNumber");

-- CreateIndex
CREATE INDEX "ErichRaceEntry_status_idx" ON "ErichRaceEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ErichRaceEntry_athleteId_eventId_raceNumber_key" ON "ErichRaceEntry"("athleteId", "eventId", "raceNumber");

-- CreateIndex
CREATE INDEX "ErichRaceEntryValuation_level_status_idx" ON "ErichRaceEntryValuation"("level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ErichRaceEntryValuation_raceEntryId_level_key" ON "ErichRaceEntryValuation"("raceEntryId", "level");

-- CreateIndex
CREATE INDEX "ErichTeamEntry_eventId_raceNumber_idx" ON "ErichTeamEntry"("eventId", "raceNumber");

-- CreateIndex
CREATE INDEX "ErichTeamEntry_status_idx" ON "ErichTeamEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ErichTeamEntry_registrationBatchId_teamName_key" ON "ErichTeamEntry"("registrationBatchId", "teamName");

-- CreateIndex
CREATE INDEX "ErichTeamMember_athleteId_idx" ON "ErichTeamMember"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichTeamMember_teamEntryId_athleteId_key" ON "ErichTeamMember"("teamEntryId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichTeamMember_teamEntryId_position_key" ON "ErichTeamMember"("teamEntryId", "position");

-- CreateIndex
CREATE INDEX "ErichBillingProfile_accountId_idx" ON "ErichBillingProfile"("accountId");

-- CreateIndex
CREATE INDEX "ErichBillingProfile_registrationBatchId_idx" ON "ErichBillingProfile"("registrationBatchId");

-- CreateIndex
CREATE INDEX "ErichPayment_eventId_status_idx" ON "ErichPayment"("eventId", "status");

-- CreateIndex
CREATE INDEX "ErichPayment_registrationBatchId_idx" ON "ErichPayment"("registrationBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichPayment_provider_providerPaymentId_key" ON "ErichPayment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "ErichPaymentAttempt_paymentId_createdAt_idx" ON "ErichPaymentAttempt"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichPaymentAttempt_status_idx" ON "ErichPaymentAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ErichPaymentAttempt_provider_providerAttemptId_key" ON "ErichPaymentAttempt"("provider", "providerAttemptId");

-- CreateIndex
CREATE INDEX "ErichPaymentWebhook_paymentId_idx" ON "ErichPaymentWebhook"("paymentId");

-- CreateIndex
CREATE INDEX "ErichPaymentWebhook_processedAt_idx" ON "ErichPaymentWebhook"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErichPaymentWebhook_provider_providerEventId_key" ON "ErichPaymentWebhook"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichInvoice_invoiceNumber_key" ON "ErichInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "ErichInvoice_registrationBatchId_idx" ON "ErichInvoice"("registrationBatchId");

-- CreateIndex
CREATE INDEX "ErichInvoice_issuedAt_idx" ON "ErichInvoice"("issuedAt");

-- CreateIndex
CREATE INDEX "ErichInvoiceLine_invoiceId_idx" ON "ErichInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "ErichInvoiceLine_raceEntryId_idx" ON "ErichInvoiceLine"("raceEntryId");

-- CreateIndex
CREATE INDEX "ErichInvoiceLine_teamEntryId_idx" ON "ErichInvoiceLine"("teamEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichCreditNote_creditNoteNumber_key" ON "ErichCreditNote"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "ErichCreditNote_invoiceId_idx" ON "ErichCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "ErichCreditNote_issuedAt_idx" ON "ErichCreditNote"("issuedAt");

-- CreateIndex
CREATE INDEX "ErichRefundCase_registrationBatchId_idx" ON "ErichRefundCase"("registrationBatchId");

-- CreateIndex
CREATE INDEX "ErichRefundCase_status_idx" ON "ErichRefundCase"("status");

-- CreateIndex
CREATE INDEX "ErichLicenseImport_eventId_createdAt_idx" ON "ErichLicenseImport"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichLicenseImport_status_idx" ON "ErichLicenseImport"("status");

-- CreateIndex
CREATE INDEX "ErichLicenseRecord_licenseImportId_idx" ON "ErichLicenseRecord"("licenseImportId");

-- CreateIndex
CREATE INDEX "ErichLicenseRecord_licenseNumber_idx" ON "ErichLicenseRecord"("licenseNumber");

-- CreateIndex
CREATE INDEX "ErichEligibilityDecision_athleteId_status_idx" ON "ErichEligibilityDecision"("athleteId", "status");

-- CreateIndex
CREATE INDEX "ErichEligibilityDecision_raceEntryId_idx" ON "ErichEligibilityDecision"("raceEntryId");

-- CreateIndex
CREATE INDEX "ErichEligibilityDecision_licenseImportId_idx" ON "ErichEligibilityDecision"("licenseImportId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichTicket_ticketId_key" ON "ErichTicket"("ticketId");

-- CreateIndex
CREATE INDEX "ErichTicket_eventId_status_idx" ON "ErichTicket"("eventId", "status");

-- CreateIndex
CREATE INDEX "ErichTicket_athleteId_idx" ON "ErichTicket"("athleteId");

-- CreateIndex
CREATE INDEX "ErichTicket_trainerId_idx" ON "ErichTicket"("trainerId");

-- CreateIndex
CREATE INDEX "ErichTicketReplacement_createdAt_idx" ON "ErichTicketReplacement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErichTicketReplacement_oldTicketId_newTicketId_key" ON "ErichTicketReplacement"("oldTicketId", "newTicketId");

-- CreateIndex
CREATE INDEX "ErichCheckIn_ticketId_scannedAt_idx" ON "ErichCheckIn"("ticketId", "scannedAt");

-- CreateIndex
CREATE INDEX "ErichCheckIn_scannerId_scannedAt_idx" ON "ErichCheckIn"("scannerId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErichCheckIn_deviceId_offlineId_key" ON "ErichCheckIn"("deviceId", "offlineId");

-- CreateIndex
CREATE INDEX "ErichDocumentIssue_issuedAt_idx" ON "ErichDocumentIssue"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErichDocumentIssue_ticketId_status_key" ON "ErichDocumentIssue"("ticketId", "status");

-- CreateIndex
CREATE INDEX "ErichScheduleAssignment_raceEntryId_idx" ON "ErichScheduleAssignment"("raceEntryId");

-- CreateIndex
CREATE INDEX "ErichScheduleAssignment_teamEntryId_idx" ON "ErichScheduleAssignment"("teamEntryId");

-- CreateIndex
CREATE INDEX "ErichScheduleAssignment_raceNumber_idx" ON "ErichScheduleAssignment"("raceNumber");

-- CreateIndex
CREATE INDEX "ErichScheduleAssignment_importJobId_idx" ON "ErichScheduleAssignment"("importJobId");

-- CreateIndex
CREATE INDEX "ErichConsentDocument_documentKey_activeFrom_idx" ON "ErichConsentDocument"("documentKey", "activeFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ErichConsentDocument_documentKey_version_language_key" ON "ErichConsentDocument"("documentKey", "version", "language");

-- CreateIndex
CREATE INDEX "ErichConsentAcceptance_accountId_acceptedAt_idx" ON "ErichConsentAcceptance"("accountId", "acceptedAt");

-- CreateIndex
CREATE INDEX "ErichConsentAcceptance_athleteId_idx" ON "ErichConsentAcceptance"("athleteId");

-- CreateIndex
CREATE INDEX "ErichEmailMessage_accountId_createdAt_idx" ON "ErichEmailMessage"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichEmailMessage_registrationBatchId_idx" ON "ErichEmailMessage"("registrationBatchId");

-- CreateIndex
CREATE INDEX "ErichEmailMessage_status_createdAt_idx" ON "ErichEmailMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ErichImportJob_eventId_importType_createdAt_idx" ON "ErichImportJob"("eventId", "importType", "createdAt");

-- CreateIndex
CREATE INDEX "ErichImportJob_status_idx" ON "ErichImportJob"("status");

-- CreateIndex
CREATE INDEX "ErichExportJob_eventId_createdAt_idx" ON "ErichExportJob"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErichExportJob_eventId_exportType_version_key" ON "ErichExportJob"("eventId", "exportType", "version");

-- CreateIndex
CREATE INDEX "ErichAuditLog_eventId_createdAt_idx" ON "ErichAuditLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichAuditLog_actorId_createdAt_idx" ON "ErichAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ErichAuditLog_entityType_entityId_idx" ON "ErichAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ErichFileAsset_storageKey_key" ON "ErichFileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ErichFileAsset_mimeType_idx" ON "ErichFileAsset"("mimeType");

-- CreateIndex
CREATE INDEX "ErichFileAsset_createdAt_idx" ON "ErichFileAsset"("createdAt");

-- CreateIndex
CREATE INDEX "ErichSystemConfiguration_key_active_idx" ON "ErichSystemConfiguration"("key", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ErichSystemConfiguration_eventId_key_version_key" ON "ErichSystemConfiguration"("eventId", "key", "version");

-- AddForeignKey
ALTER TABLE "ErichRoleAssignment" ADD CONSTRAINT "ErichRoleAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRoleAssignment" ADD CONSTRAINT "ErichRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichChampionship" ADD CONSTRAINT "ErichChampionship_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichClub" ADD CONSTRAINT "ErichClub_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "ErichClubImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichClubImport" ADD CONSTRAINT "ErichClubImport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceDefinition" ADD CONSTRAINT "ErichRaceDefinition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceDefinition" ADD CONSTRAINT "ErichRaceDefinition_fallbackRaceId_fkey" FOREIGN KEY ("fallbackRaceId") REFERENCES "ErichRaceDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceVersion" ADD CONSTRAINT "ErichRaceVersion_raceDefinitionId_fkey" FOREIGN KEY ("raceDefinitionId") REFERENCES "ErichRaceDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceEligibilityRule" ADD CONSTRAINT "ErichRaceEligibilityRule_raceDefinitionId_fkey" FOREIGN KEY ("raceDefinitionId") REFERENCES "ErichRaceDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichPricePhase" ADD CONSTRAINT "ErichPricePhase_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRacePrice" ADD CONSTRAINT "ErichRacePrice_raceDefinitionId_fkey" FOREIGN KEY ("raceDefinitionId") REFERENCES "ErichRaceDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRacePrice" ADD CONSTRAINT "ErichRacePrice_pricePhaseId_fkey" FOREIGN KEY ("pricePhaseId") REFERENCES "ErichPricePhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichAthlete" ADD CONSTRAINT "ErichAthlete_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichAthlete" ADD CONSTRAINT "ErichAthlete_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ErichClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTrainer" ADD CONSTRAINT "ErichTrainer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTrainer" ADD CONSTRAINT "ErichTrainer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "ErichClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRegistrationBatch" ADD CONSTRAINT "ErichRegistrationBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRegistrationBatch" ADD CONSTRAINT "ErichRegistrationBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceEntry" ADD CONSTRAINT "ErichRaceEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceEntry" ADD CONSTRAINT "ErichRaceEntry_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "ErichRegistrationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceEntry" ADD CONSTRAINT "ErichRaceEntry_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "ErichAthlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceEntry" ADD CONSTRAINT "ErichRaceEntry_raceDefinitionId_fkey" FOREIGN KEY ("raceDefinitionId") REFERENCES "ErichRaceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRaceEntryValuation" ADD CONSTRAINT "ErichRaceEntryValuation_raceEntryId_fkey" FOREIGN KEY ("raceEntryId") REFERENCES "ErichRaceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTeamEntry" ADD CONSTRAINT "ErichTeamEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTeamEntry" ADD CONSTRAINT "ErichTeamEntry_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "ErichRegistrationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTeamEntry" ADD CONSTRAINT "ErichTeamEntry_raceDefinitionId_fkey" FOREIGN KEY ("raceDefinitionId") REFERENCES "ErichRaceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTeamMember" ADD CONSTRAINT "ErichTeamMember_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "ErichTeamEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTeamMember" ADD CONSTRAINT "ErichTeamMember_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "ErichAthlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichBillingProfile" ADD CONSTRAINT "ErichBillingProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichBillingProfile" ADD CONSTRAINT "ErichBillingProfile_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "ErichRegistrationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichPayment" ADD CONSTRAINT "ErichPayment_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "ErichRegistrationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichPayment" ADD CONSTRAINT "ErichPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichPaymentAttempt" ADD CONSTRAINT "ErichPaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ErichPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichPaymentWebhook" ADD CONSTRAINT "ErichPaymentWebhook_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ErichPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichInvoice" ADD CONSTRAINT "ErichInvoice_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "ErichRegistrationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichInvoice" ADD CONSTRAINT "ErichInvoice_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "ErichBillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichInvoice" ADD CONSTRAINT "ErichInvoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ErichPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichInvoiceLine" ADD CONSTRAINT "ErichInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ErichInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichInvoiceLine" ADD CONSTRAINT "ErichInvoiceLine_raceEntryId_fkey" FOREIGN KEY ("raceEntryId") REFERENCES "ErichRaceEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichInvoiceLine" ADD CONSTRAINT "ErichInvoiceLine_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "ErichTeamEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichCreditNote" ADD CONSTRAINT "ErichCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ErichInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRefundCase" ADD CONSTRAINT "ErichRefundCase_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "ErichRegistrationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichRefundCase" ADD CONSTRAINT "ErichRefundCase_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ErichPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichLicenseImport" ADD CONSTRAINT "ErichLicenseImport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichLicenseRecord" ADD CONSTRAINT "ErichLicenseRecord_licenseImportId_fkey" FOREIGN KEY ("licenseImportId") REFERENCES "ErichLicenseImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichEligibilityDecision" ADD CONSTRAINT "ErichEligibilityDecision_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "ErichAthlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichEligibilityDecision" ADD CONSTRAINT "ErichEligibilityDecision_raceEntryId_fkey" FOREIGN KEY ("raceEntryId") REFERENCES "ErichRaceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichEligibilityDecision" ADD CONSTRAINT "ErichEligibilityDecision_licenseImportId_fkey" FOREIGN KEY ("licenseImportId") REFERENCES "ErichLicenseImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicket" ADD CONSTRAINT "ErichTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicket" ADD CONSTRAINT "ErichTicket_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "ErichAthlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicket" ADD CONSTRAINT "ErichTicket_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "ErichTrainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicket" ADD CONSTRAINT "ErichTicket_raceEntryId_fkey" FOREIGN KEY ("raceEntryId") REFERENCES "ErichRaceEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicket" ADD CONSTRAINT "ErichTicket_teamEntryId_fkey" FOREIGN KEY ("teamEntryId") REFERENCES "ErichTeamEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicketReplacement" ADD CONSTRAINT "ErichTicketReplacement_oldTicketId_fkey" FOREIGN KEY ("oldTicketId") REFERENCES "ErichTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichTicketReplacement" ADD CONSTRAINT "ErichTicketReplacement_newTicketId_fkey" FOREIGN KEY ("newTicketId") REFERENCES "ErichTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichCheckIn" ADD CONSTRAINT "ErichCheckIn_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ErichTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichDocumentIssue" ADD CONSTRAINT "ErichDocumentIssue_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ErichTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichConsentAcceptance" ADD CONSTRAINT "ErichConsentAcceptance_consentDocumentId_fkey" FOREIGN KEY ("consentDocumentId") REFERENCES "ErichConsentDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichImportJob" ADD CONSTRAINT "ErichImportJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichExportJob" ADD CONSTRAINT "ErichExportJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichAuditLog" ADD CONSTRAINT "ErichAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichAuditLog" ADD CONSTRAINT "ErichAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErichSystemConfiguration" ADD CONSTRAINT "ErichSystemConfiguration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErichEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
