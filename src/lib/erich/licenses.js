import { writeErichAuditLog } from "./audit.js";
import { ERICH_PERMISSIONS, assertErichPermission } from "./permissions.js";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MANUAL_DECISION_STATUSES = new Set([
    "MANUAL_REVIEW",
    "MANUAL_CONFIRMED",
    "REJECTED",
]);

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function text(value) {
    return String(value ?? "").trim();
}

function nullableText(value) {
    const normalized = text(value);
    return normalized || null;
}

function normalizeLicenseNumber(value) {
    return nullableText(value)?.replace(/\s+/g, "").toUpperCase() ?? null;
}

function normalizeBirthDate(value) {
    const raw = nullableText(value);
    if (!raw) return null;

    let date;
    const dateOnlyMatch = raw.match(DATE_ONLY_PATTERN);
    if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch.map(Number);
        date = new Date(Date.UTC(year, month - 1, day));
        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            date = new Date(NaN);
        }
    } else {
        date = new Date(raw);
    }

    if (Number.isNaN(date.getTime())) {
        throw structuredError({
            code: "ERICH_LICENSE_INVALID_BIRTH_DATE",
            message: "ERICH license record birth date is invalid.",
        });
    }

    return date;
}

function personKey({ firstName, lastName, birthDate }) {
    if (!firstName || !lastName || !birthDate) return null;
    return [
        String(firstName).trim().toLowerCase(),
        String(lastName).trim().toLowerCase(),
        new Date(birthDate).toISOString().slice(0, 10),
    ].join("|");
}

export function normalizeErichLicenseRecordInput(input = {}) {
    const licenseNumber = normalizeLicenseNumber(input.licenseNumber ?? input.germanLicenseNumber);
    const firstName = nullableText(input.firstName);
    const lastName = nullableText(input.lastName);
    const birthDate = normalizeBirthDate(input.birthDate);

    if (!licenseNumber && (!firstName || !lastName || !birthDate)) {
        throw structuredError({
            code: "ERICH_LICENSE_RECORD_INCOMPLETE",
            message: "ERICH license record requires a license number or full person identity.",
        });
    }

    return {
        licenseNumber,
        firstName,
        lastName,
        birthDate,
        clubName: nullableText(input.clubName),
        rawData: input,
    };
}

function assertCanManageLicenseReviews(user, eventId = null) {
    return assertErichPermission(user, ERICH_PERMISSIONS.MANAGE_LICENSE_REVIEWS, eventId);
}

async function findMatchingAthletes(store, record) {
    if (record.licenseNumber) {
        const byLicense = await store.erichAthlete.findMany({
            where: { germanLicenseNumber: record.licenseNumber },
        });
        if (byLicense.length > 0) return byLicense;
    }

    if (record.firstName && record.lastName && record.birthDate) {
        return store.erichAthlete.findMany({
            where: {
                firstName: record.firstName,
                lastName: record.lastName,
                birthDate: record.birthDate,
            },
        });
    }

    return [];
}

async function createAutomaticDecisionForAthlete(tx, {
    eventId,
    athlete,
    licenseImportId,
    licenseRecord,
}) {
    const updatedValuations = await tx.erichRaceEntryValuation.updateMany({
        where: {
            status: "PENDING_IMPORT",
            dependsOnLicenseCheck: true,
            raceEntry: {
                eventId,
                athleteId: athlete.id,
            },
        },
        data: {
            status: "AUTO_CONFIRMED",
            decisionSnapshot: {
                source: "license_import",
                licenseImportId,
                licenseRecordId: licenseRecord.id,
                licenseNumber: licenseRecord.licenseNumber,
            },
        },
    });

    await tx.erichEligibilityDecision.create({
        data: {
            athleteId: athlete.id,
            licenseImportId,
            status: "AUTO_CONFIRMED",
            automatic: true,
            decidedAt: new Date(),
            reason: "Matched ERICH license import record",
            decisionData: {
                licenseRecordId: licenseRecord.id,
                licenseNumber: licenseRecord.licenseNumber,
                updatedValuationCount: updatedValuations.count,
            },
        },
    });

    return updatedValuations.count;
}

export async function importErichLicenseRecords(store, {
    user,
    eventId,
    rows,
    sheetName = null,
    columnMapping = null,
    auditReason = "Import ERICH license records",
}) {
    assertCanManageLicenseReviews(user, eventId);
    if (!eventId) {
        throw structuredError({
            code: "ERICH_EVENT_REQUIRED",
            message: "ERICH event is required for license import.",
        });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        throw structuredError({
            code: "ERICH_LICENSE_IMPORT_EMPTY",
            message: "ERICH license import rows are required.",
        });
    }

    const normalizedRows = rows.map((row) => normalizeErichLicenseRecordInput(row));

    return store.$transaction(async (tx) => {
        const licenseImport = await tx.erichLicenseImport.create({
            data: {
                eventId,
                status: "APPLIED",
                sheetName,
                columnMapping,
                importedAt: new Date(),
                validationReport: {
                    rowCount: rows.length,
                },
            },
        });

        const counters = {
            recordCount: 0,
            matchedAthleteCount: 0,
            ambiguousRecordCount: 0,
            updatedValuationCount: 0,
        };
        const seenAthletes = new Set();
        const seenPersonKeys = new Set();

        for (const recordInput of normalizedRows) {
            const duplicatePersonKey = personKey(recordInput);
            if (duplicatePersonKey) seenPersonKeys.add(duplicatePersonKey);

            const licenseRecord = await tx.erichLicenseRecord.create({
                data: {
                    licenseImportId: licenseImport.id,
                    ...recordInput,
                },
            });
            counters.recordCount += 1;

            const matches = await findMatchingAthletes(tx, recordInput);
            if (matches.length !== 1) {
                if (matches.length > 1) counters.ambiguousRecordCount += 1;
                continue;
            }

            const athlete = matches[0];
            if (!seenAthletes.has(athlete.id)) {
                counters.matchedAthleteCount += 1;
                seenAthletes.add(athlete.id);
            }

            counters.updatedValuationCount += await createAutomaticDecisionForAthlete(tx, {
                eventId,
                athlete,
                licenseImportId: licenseImport.id,
                licenseRecord,
            });
        }

        await writeErichAuditLog({
            store: tx,
            eventId,
            actorId: user.id,
            entityType: "ErichLicenseImport",
            entityId: licenseImport.id,
            action: "license.import_applied",
            reason: auditReason,
            oldValue: null,
            newValue: counters,
            metadata: {
                rowCount: rows.length,
                distinctPersonKeys: seenPersonKeys.size,
            },
        });

        return {
            licenseImport,
            ...counters,
        };
    });
}

export async function recordManualEligibilityDecision(store, {
    user,
    eventId,
    athleteId,
    raceEntryId = null,
    status,
    reason,
    decisionData = null,
}) {
    assertCanManageLicenseReviews(user, eventId);

    const normalizedStatus = text(status).toUpperCase();
    const normalizedReason = text(reason);

    if (!MANUAL_DECISION_STATUSES.has(normalizedStatus)) {
        throw structuredError({
            code: "ERICH_ELIGIBILITY_DECISION_STATUS_INVALID",
            message: "ERICH eligibility decision status is invalid.",
            details: { status: normalizedStatus },
        });
    }
    if (!athleteId) {
        throw structuredError({
            code: "ERICH_ATHLETE_REQUIRED",
            message: "ERICH athlete is required for eligibility decision.",
        });
    }
    if (normalizedReason.length < 5) {
        throw structuredError({
            code: "ERICH_ELIGIBILITY_DECISION_REASON_REQUIRED",
            message: "ERICH eligibility decision reason is required.",
        });
    }

    return store.$transaction(async (tx) => {
        const decision = await tx.erichEligibilityDecision.create({
            data: {
                athleteId,
                raceEntryId,
                status: normalizedStatus,
                automatic: false,
                decidedById: user.id,
                decidedAt: new Date(),
                reason: normalizedReason,
                decisionData,
            },
        });

        let updatedValuationCount = 0;
        if (raceEntryId) {
            const updated = await tx.erichRaceEntryValuation.updateMany({
                where: {
                    raceEntryId,
                    dependsOnLicenseCheck: true,
                },
                data: {
                    status: normalizedStatus,
                    decisionSnapshot: {
                        source: "manual_decision",
                        decisionId: decision.id,
                        reason: normalizedReason,
                    },
                },
            });
            updatedValuationCount = updated.count;
        }

        await writeErichAuditLog({
            store: tx,
            eventId,
            actorId: user.id,
            entityType: "ErichEligibilityDecision",
            entityId: decision.id,
            action: "eligibility.manual_decision_recorded",
            reason: normalizedReason,
            oldValue: null,
            newValue: {
                athleteId,
                raceEntryId,
                status: normalizedStatus,
                updatedValuationCount,
            },
            critical: true,
        });

        return {
            decision,
            updatedValuationCount,
        };
    });
}
