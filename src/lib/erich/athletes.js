import { writeErichAuditLog } from "./audit.js";
import { assertErichPermission, canErich, ERICH_PERMISSIONS } from "./permissions.js";

export const ERICH_ATHLETE_GENDERS = Object.freeze({
    MALE: "MALE",
    FEMALE: "FEMALE",
});

const MIN_BIRTH_YEAR = 1900;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2,3}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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

function normalizeCountryCode(value, fieldName) {
    const normalized = text(value).toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(normalized)) {
        throw structuredError({
            code: "ERICH_INVALID_COUNTRY_CODE",
            message: `${fieldName} must be an ISO-style country code.`,
            details: { fieldName },
        });
    }
    return normalized;
}

function normalizeGender(value) {
    const normalized = text(value).toUpperCase();
    if (!Object.values(ERICH_ATHLETE_GENDERS).includes(normalized)) {
        throw structuredError({
            code: "ERICH_INVALID_ATHLETE_GENDER",
            message: "Athlete gender must be MALE or FEMALE.",
            details: { gender: normalized },
        });
    }
    return normalized;
}

function normalizeEmail(value) {
    const normalized = nullableText(value);
    if (normalized && !EMAIL_PATTERN.test(normalized)) {
        throw structuredError({
            code: "ERICH_INVALID_ATHLETE_EMAIL",
            message: "Athlete email is invalid.",
        });
    }
    return normalized;
}

function normalizeBirthDate(value, now = new Date()) {
    let date;

    if (value instanceof Date) {
        date = value;
    } else {
        const raw = text(value);
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
    }

    if (Number.isNaN(date.getTime())) {
        throw structuredError({
            code: "ERICH_INVALID_BIRTH_DATE",
            message: "Athlete birth date is invalid.",
        });
    }

    if (date.getUTCFullYear() < MIN_BIRTH_YEAR || date.getTime() > now.getTime()) {
        throw structuredError({
            code: "ERICH_BIRTH_DATE_OUT_OF_RANGE",
            message: "Athlete birth date is outside the allowed range.",
        });
    }

    return date;
}

export function deriveBirthYear(birthDate) {
    const date = normalizeBirthDate(birthDate);
    return date.getUTCFullYear();
}

export function normalizeErichAthleteInput(input = {}, { accountId, now = new Date() } = {}) {
    const firstName = text(input.firstName);
    const lastName = text(input.lastName);
    const clubId = text(input.clubId);
    const normalizedAccountId = text(accountId ?? input.accountId);

    if (!normalizedAccountId) throw new Error("accountId is required.");
    if (!clubId) throw new Error("clubId is required.");
    if (!firstName) throw new Error("firstName is required.");
    if (!lastName) throw new Error("lastName is required.");

    const birthDate = normalizeBirthDate(input.birthDate, now);

    return {
        accountId: normalizedAccountId,
        clubId,
        firstName,
        lastName,
        gender: normalizeGender(input.gender),
        birthDate,
        birthYear: birthDate.getUTCFullYear(),
        nationalityCode: normalizeCountryCode(input.nationalityCode ?? "DE", "nationalityCode"),
        email: normalizeEmail(input.email),
        lightweight: Boolean(input.lightweight),
        parasport: Boolean(input.parasport),
        germanLicenseNumber: nullableText(input.germanLicenseNumber),
    };
}

export function buildAthleteAuditSnapshot(athlete) {
    if (!athlete) return null;

    return {
        id: athlete.id ?? null,
        accountId: athlete.accountId,
        clubId: athlete.clubId,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        gender: athlete.gender,
        birthYear: athlete.birthYear,
        nationalityCode: athlete.nationalityCode,
        email: athlete.email ?? null,
        lightweight: Boolean(athlete.lightweight),
        germanLicenseNumberPresent: Boolean(athlete.germanLicenseNumber),
    };
}

export function assertCanManageErichAthlete({ user, accountId, eventId = null }) {
    if (!user?.id) throw new Error("user is required.");
    if (!accountId) throw new Error("accountId is required.");

    if (user.id === accountId && canErich(user, ERICH_PERMISSIONS.MANAGE_OWN_DRAFTS, eventId)) {
        return true;
    }

    return assertErichPermission(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, eventId);
}

export async function createErichAthlete(store, {
    user,
    input,
    accountId = user?.id,
    eventId = null,
    auditReason = "Athlete profile created for ERICH registration",
    now = new Date(),
}) {
    const data = normalizeErichAthleteInput(input, { accountId, now });
    assertCanManageErichAthlete({ user, accountId: data.accountId, eventId });

    let athlete;

    try {
        athlete = await store.erichAthlete.create({ data });
    } catch (error) {
        if (error?.code === "P2003") {
            throw structuredError({
                code: "ERICH_ATHLETE_REFERENCE_NOT_FOUND",
                message: "Referenced ERICH account or club was not found.",
            });
        }

        throw error;
    }

    await writeErichAuditLog({
        store,
        eventId,
        actorId: user.id,
        entityType: "ErichAthlete",
        entityId: athlete.id,
        action: "athlete.created",
        reason: auditReason,
        oldValue: null,
        newValue: buildAthleteAuditSnapshot(athlete),
        metadata: {
            managedOwnRecord: athlete.accountId === user.id,
        },
    });

    return athlete;
}

export async function updateErichAthlete(store, {
    user,
    athleteId,
    input,
    eventId = null,
    auditReason = "Athlete profile updated for ERICH registration",
    now = new Date(),
}) {
    const normalizedAthleteId = text(athleteId);
    if (!normalizedAthleteId) {
        throw structuredError({
            code: "ERICH_ATHLETE_REQUIRED",
            message: "Athlete is required.",
        });
    }

    const existing = await store.erichAthlete.findUnique({ where: { id: normalizedAthleteId } });

    if (!existing) {
        throw structuredError({
            code: "ERICH_ATHLETE_NOT_FOUND",
            message: "Athlete was not found.",
        });
    }

    assertCanManageErichAthlete({ user, accountId: existing.accountId, eventId });
    const data = normalizeErichAthleteInput(input, { accountId: existing.accountId, now });

    let athlete;

    try {
        athlete = await store.erichAthlete.update({
            where: { id: normalizedAthleteId },
            data,
        });
    } catch (error) {
        if (error?.code === "P2003") {
            throw structuredError({
                code: "ERICH_ATHLETE_REFERENCE_NOT_FOUND",
                message: "Referenced ERICH account or club was not found.",
            });
        }

        throw error;
    }

    await writeErichAuditLog({
        store,
        eventId,
        actorId: user.id,
        entityType: "ErichAthlete",
        entityId: athlete.id,
        action: "athlete.updated",
        reason: auditReason,
        oldValue: buildAthleteAuditSnapshot(existing),
        newValue: buildAthleteAuditSnapshot(athlete),
        metadata: {
            managedOwnRecord: athlete.accountId === user.id,
        },
    });

    return athlete;
}

async function deleteErichAthleteInStore(store, {
    user,
    athleteId,
    eventId,
    auditReason,
}) {
    const existing = await store.erichAthlete.findUnique({
        where: { id: athleteId },
        include: {
            _count: {
                select: {
                    raceEntries: true,
                    teamMembers: true,
                    tickets: true,
                },
            },
        },
    });

    if (!existing) {
        throw structuredError({
            code: "ERICH_ATHLETE_NOT_FOUND",
            message: "Athlete was not found.",
        });
    }

    assertCanManageErichAthlete({ user, accountId: existing.accountId, eventId });

    const linkedRecordCount =
        Number(existing._count?.raceEntries ?? 0) +
        Number(existing._count?.teamMembers ?? 0) +
        Number(existing._count?.tickets ?? 0);

    if (linkedRecordCount > 0) {
        throw structuredError({
            code: "ERICH_ATHLETE_HAS_REGISTRATIONS",
            message: "Athlete cannot be deleted while registrations or tickets still reference it.",
            details: {
                raceEntryCount: existing._count?.raceEntries ?? 0,
                teamMemberCount: existing._count?.teamMembers ?? 0,
                ticketCount: existing._count?.tickets ?? 0,
            },
        });
    }

    const oldValue = buildAthleteAuditSnapshot(existing);
    const consentResult = store.erichConsentAcceptance
        ? await store.erichConsentAcceptance.deleteMany({
              where: { athleteId },
          })
        : { count: 0 };

    let deleted;

    try {
        deleted = await store.erichAthlete.delete({
            where: { id: athleteId },
        });
    } catch (error) {
        if (error?.code === "P2025") {
            throw structuredError({
                code: "ERICH_ATHLETE_NOT_FOUND",
                message: "Athlete was not found.",
            });
        }

        if (error?.code === "P2003") {
            throw structuredError({
                code: "ERICH_ATHLETE_HAS_REGISTRATIONS",
                message: "Athlete cannot be deleted while registrations or tickets still reference it.",
            });
        }

        throw error;
    }

    await writeErichAuditLog({
        store,
        eventId,
        actorId: user.id,
        entityType: "ErichAthlete",
        entityId: athleteId,
        action: "athlete.deleted",
        reason: auditReason,
        oldValue,
        newValue: null,
        metadata: {
            managedOwnRecord: existing.accountId === user.id,
            deletedConsentAcceptanceCount: consentResult.count,
        },
    });

    return {
        athlete: deleted,
        deletedConsentAcceptanceCount: consentResult.count,
    };
}

export async function deleteErichAthlete(store, {
    user,
    athleteId,
    eventId = null,
    auditReason = "Athlete profile deleted from ERICH registration",
}) {
    const normalizedAthleteId = text(athleteId);
    if (!normalizedAthleteId) {
        throw structuredError({
            code: "ERICH_ATHLETE_REQUIRED",
            message: "Athlete is required.",
        });
    }

    if (store.$transaction) {
        return store.$transaction((tx) =>
            deleteErichAthleteInStore(tx, {
                user,
                athleteId: normalizedAthleteId,
                eventId,
                auditReason,
            })
        );
    }

    return deleteErichAthleteInStore(store, {
        user,
        athleteId: normalizedAthleteId,
        eventId,
        auditReason,
    });
}
