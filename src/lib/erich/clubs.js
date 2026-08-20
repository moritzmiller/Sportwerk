import { writeErichAuditLog } from "./audit.js";
import { ERICH_PERMISSIONS, assertErichPermission } from "./permissions.js";

const COUNTRY_CODE_PATTERN = /^[A-Z]{2,3}$/;
const CENTRAL_GERMAN_STATES = new Set([
    "SN",
    "SACHSEN",
    "SAXONY",
    "ST",
    "SACHSEN-ANHALT",
    "SAXONY-ANHALT",
    "TH",
    "THUERINGEN",
    "THÜRINGEN",
    "THURINGIA",
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

function normalizeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = text(value).toLowerCase();
    if (!normalized) return fallback;
    return ["1", "true", "yes", "ja", "y", "x"].includes(normalized);
}

function normalizeCountryCode(value) {
    const normalized = text(value || "DE").toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(normalized)) {
        throw structuredError({
            code: "ERICH_CLUB_INVALID_COUNTRY_CODE",
            message: "ERICH club country code is invalid.",
            details: { countryCode: normalized },
        });
    }
    return normalized;
}

function normalizeState(value) {
    return nullableText(value)?.toUpperCase() ?? null;
}

function inferCentralGermanClub({ countryCode, federalState, stateRowingAssociation }) {
    if (countryCode !== "DE") return false;
    const state = normalizeState(federalState);
    const association = normalizeState(stateRowingAssociation);
    return CENTRAL_GERMAN_STATES.has(state) || CENTRAL_GERMAN_STATES.has(association);
}

export function buildErichClubSearchText(club) {
    return [
        club.officialName,
        club.externalFederationId,
        club.countryCode,
        club.federalState,
        club.stateRowingAssociation,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeErichClubInput(input = {}) {
    const officialName = text(input.officialName ?? input.name);
    if (!officialName) {
        throw structuredError({
            code: "ERICH_CLUB_NAME_REQUIRED",
            message: "ERICH club official name is required.",
        });
    }

    const countryCode = normalizeCountryCode(input.countryCode);
    const federalState = normalizeState(input.federalState);
    const stateRowingAssociation = normalizeState(input.stateRowingAssociation);
    const isGermanClub = input.isGermanClub === undefined ? countryCode === "DE" : normalizeBoolean(input.isGermanClub);
    const isCentralGermanClub =
        input.isCentralGermanClub === undefined
            ? inferCentralGermanClub({ countryCode, federalState, stateRowingAssociation })
            : normalizeBoolean(input.isCentralGermanClub);
    const stateAssociationMember = normalizeBoolean(input.stateAssociationMember, isGermanClub);

    const data = {
        externalFederationId: nullableText(input.externalFederationId),
        officialName,
        countryCode,
        federalState,
        stateRowingAssociation,
        stateAssociationMember,
        isGermanClub,
        isCentralGermanClub,
        active: normalizeBoolean(input.active, true),
    };

    return {
        ...data,
        searchText: buildErichClubSearchText(data),
    };
}

function assertCanManageClubs(user, eventId = null) {
    return assertErichPermission(user, ERICH_PERMISSIONS.MANAGE_RACE_MASTER_DATA, eventId);
}

export async function createErichClub(store, {
    user,
    input,
    eventId = null,
    auditReason = "Create ERICH club master data",
}) {
    assertCanManageClubs(user, eventId);
    const data = normalizeErichClubInput(input);

    const club = await store.erichClub.create({ data });

    await writeErichAuditLog({
        store,
        eventId,
        actorId: user.id,
        entityType: "ErichClub",
        entityId: club.id,
        action: "club.created",
        reason: auditReason,
        oldValue: null,
        newValue: club,
    });

    return club;
}

export async function updateErichClub(store, {
    user,
    clubId,
    input,
    eventId = null,
    auditReason = "Update ERICH club master data",
}) {
    assertCanManageClubs(user, eventId);
    const data = normalizeErichClubInput(input);
    const existing = await store.erichClub.findUnique({ where: { id: clubId } });

    if (!existing) {
        throw structuredError({
            code: "ERICH_CLUB_NOT_FOUND",
            message: "ERICH club was not found.",
        });
    }

    const club = await store.erichClub.update({
        where: { id: clubId },
        data,
    });

    await writeErichAuditLog({
        store,
        eventId,
        actorId: user.id,
        entityType: "ErichClub",
        entityId: club.id,
        action: "club.updated",
        reason: auditReason,
        oldValue: existing,
        newValue: club,
    });

    return club;
}

async function findExistingClub(store, data) {
    if (data.externalFederationId) {
        const byExternalId = await store.erichClub.findFirst({
            where: { externalFederationId: data.externalFederationId },
        });
        if (byExternalId) return byExternalId;
    }

    return store.erichClub.findFirst({
        where: {
            officialName: data.officialName,
            countryCode: data.countryCode,
        },
    });
}

export async function importErichClubs(store, {
    user,
    eventId,
    rows,
    originalFileName = null,
    auditReason = "Import ERICH club master data",
}) {
    assertCanManageClubs(user, eventId);
    if (!eventId) {
        throw structuredError({
            code: "ERICH_EVENT_REQUIRED",
            message: "ERICH event is required for club import.",
        });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        throw structuredError({
            code: "ERICH_CLUB_IMPORT_EMPTY",
            message: "ERICH club import rows are required.",
        });
    }

    return store.$transaction(async (tx) => {
        const clubImport = await tx.erichClubImport.create({
            data: {
                eventId,
                status: "APPLIED",
                originalFileName,
                importedAt: new Date(),
                importedById: user.id,
                validationReport: {
                    rowCount: rows.length,
                },
            },
        });

        const counters = {
            createdClubCount: 0,
            updatedClubCount: 0,
        };

        for (const [index, row] of rows.entries()) {
            const data = {
                ...normalizeErichClubInput(row),
                sourceImportId: clubImport.id,
                sourceRow: {
                    rowNumber: index + 1,
                    raw: row,
                },
            };
            const existing = await findExistingClub(tx, data);

            if (existing) {
                await tx.erichClub.update({
                    where: { id: existing.id },
                    data,
                });
                counters.updatedClubCount += 1;
            } else {
                await tx.erichClub.create({ data });
                counters.createdClubCount += 1;
            }
        }

        await writeErichAuditLog({
            store: tx,
            eventId,
            actorId: user.id,
            entityType: "ErichClubImport",
            entityId: clubImport.id,
            action: "club.import_applied",
            reason: auditReason,
            oldValue: null,
            newValue: {
                originalFileName,
                ...counters,
            },
            metadata: {
                rowCount: rows.length,
            },
        });

        return {
            clubImport,
            ...counters,
        };
    });
}
