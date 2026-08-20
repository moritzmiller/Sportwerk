import { ERICH_PRICE_PHASE_KEYS } from "./excel-import.js";
import { assertCentAmount, assertCurrency } from "./money.js";

export const ERICH_RACE_MASTER_IMPORT_TYPE = "RACE_MASTER_DATA";

export const ERICH_PRICE_PHASE_LABELS = Object.freeze({
    SEPT: "September",
    OCT_NOV: "Oktober/November",
    DEC_JAN: "Dezember/Januar",
});

function isWithinPhaseWindow(phase, now = new Date()) {
    const currentTime = now.getTime();
    const startsAt = phase.startsAt ? new Date(phase.startsAt).getTime() : null;
    const endsAt = phase.endsAt ? new Date(phase.endsAt).getTime() : null;

    if (startsAt !== null && currentTime < startsAt) return false;
    if (endsAt !== null && currentTime > endsAt) return false;
    return true;
}

function resolveActivePhaseKey({ activePhaseKey, pricePhases = [], now = new Date() }) {
    if (activePhaseKey) return activePhaseKey;

    const matchingPhase = pricePhases.find((phase) => isWithinPhaseWindow(phase, now));
    return matchingPhase?.name ?? "SEPT";
}

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function normalizeRequiredId(value, name) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw structuredError({
            code: "ERICH_IMPORT_INVALID_INPUT",
            message: `${name} is required.`,
        });
    }
    return normalized;
}

function summarizeDryRun(dryRun) {
    return {
        summary: dryRun?.summary ?? null,
        issueRows: (dryRun?.races ?? [])
            .filter((race) => (race.issues ?? []).length > 0)
            .map((race) => ({
                raceNumber: race.raceNumber,
                sourceRow: race.sourceRow,
                importStatus: race.importStatus,
                issues: race.issues.map((issue) => issue.code),
            })),
    };
}

function assertDryRunCanApply(dryRun) {
    if (!dryRun || !Array.isArray(dryRun.races)) {
        throw structuredError({
            code: "ERICH_IMPORT_INVALID_DRY_RUN",
            message: "ERICH dry-run result is required.",
        });
    }

    const duplicates = dryRun.summary?.duplicateRaceNumbers ?? [];
    if (duplicates.length > 0) {
        throw structuredError({
            code: "ERICH_IMPORT_DUPLICATE_RACE_NUMBERS",
            message: "ERICH race master data contains duplicate race numbers.",
            details: { duplicateRaceNumbers: duplicates },
        });
    }
}

function normalizeRaceStatus(importStatus) {
    return importStatus === "ACTIVE" ? "ACTIVE" : "REVIEW_REQUIRED";
}

function reviewReasonForRace(race) {
    const codes = (race.issues ?? []).map((issue) => issue.code);
    if (codes.length === 0) return null;
    return `Excel review required: ${codes.join(", ")}`;
}

function raceDefinitionData({ eventId, race }) {
    return {
        eventId,
        raceNumber: race.raceNumber,
        gender: race.gender,
        classLabel: race.classLabel,
        distanceLabel: race.distanceLabel,
        includesErich: Boolean(race.includesErich),
        includesDm: Boolean(race.includesDm),
        includesMdm: Boolean(race.includesMdm),
        isLightweight: Boolean(race.isLightweight),
        isPara: Boolean(race.isPara),
        isTeamRace: Boolean(race.isTeamRace),
        requiredTeamSize: race.requiredTeamSize ?? null,
        sameClubRequired: race.sameClubRequired ?? null,
        mixedClubsAllowed: race.mixedClubsAllowed ?? null,
        maleCount: race.maleCount ?? null,
        femaleCount: race.femaleCount ?? null,
        minimumBirthYear: race.minimumBirthYear ?? null,
        maximumBirthYear: race.maximumBirthYear ?? null,
        higherAgeClassAllowed: Boolean(race.higherAgeClassAllowed),
        higherAgeMinimumBirthYear: race.higherAgeMinimumBirthYear ?? null,
        status: normalizeRaceStatus(race.importStatus),
        reviewReason: reviewReasonForRace(race),
        sourceSheet: race.sourceSheet,
        sourceRow: race.sourceRow,
    };
}

function comparableRaceSnapshot(data) {
    return {
        raceNumber: data.raceNumber,
        gender: data.gender ?? null,
        classLabel: data.classLabel ?? null,
        distanceLabel: data.distanceLabel ?? null,
        includesErich: data.includesErich,
        includesDm: data.includesDm,
        includesMdm: data.includesMdm,
        isLightweight: data.isLightweight,
        isPara: data.isPara,
        isTeamRace: data.isTeamRace,
        requiredTeamSize: data.requiredTeamSize ?? null,
        sameClubRequired: data.sameClubRequired ?? null,
        mixedClubsAllowed: data.mixedClubsAllowed ?? null,
        maleCount: data.maleCount ?? null,
        femaleCount: data.femaleCount ?? null,
        minimumBirthYear: data.minimumBirthYear ?? null,
        maximumBirthYear: data.maximumBirthYear ?? null,
        higherAgeClassAllowed: Boolean(data.higherAgeClassAllowed),
        higherAgeMinimumBirthYear: data.higherAgeMinimumBirthYear ?? null,
        status: data.status,
        reviewReason: data.reviewReason ?? null,
        sourceSheet: data.sourceSheet ?? null,
        sourceRow: data.sourceRow ?? null,
    };
}

function hasRaceChanged(existing, nextData) {
    if (!existing) return true;
    return JSON.stringify(comparableRaceSnapshot(existing)) !== JSON.stringify(comparableRaceSnapshot(nextData));
}

export function buildPricePhaseData({
    eventId,
    activePhaseKey = null,
    pricePhases = [],
    now = new Date(),
} = {}) {
    const resolvedActivePhaseKey = resolveActivePhaseKey({ activePhaseKey, pricePhases, now });

    if (!ERICH_PRICE_PHASE_KEYS.includes(resolvedActivePhaseKey)) {
        throw structuredError({
            code: "ERICH_IMPORT_INVALID_PRICE_PHASE",
            message: "Active ERICH price phase is invalid.",
            details: { activePhaseKey: resolvedActivePhaseKey },
        });
    }

    return ERICH_PRICE_PHASE_KEYS.map((phaseKey, index) => ({
        ...(pricePhases.find((phase) => phase.name === phaseKey) ?? {}),
        eventId,
        name: phaseKey,
        sortOrder: index + 1,
        active: phaseKey === resolvedActivePhaseKey,
    }));
}

export async function ensureErichPricePhases(store, {
    eventId,
    activePhaseKey = null,
    pricePhases = [],
    now = new Date(),
}) {
    const phaseRows = buildPricePhaseData({ eventId, activePhaseKey, pricePhases, now });
    const phases = [];

    for (const phase of phaseRows) {
        phases.push(
            await store.erichPricePhase.upsert({
                where: {
                    eventId_name: {
                        eventId,
                        name: phase.name,
                    },
                },
                create: phase,
                update: {
                    startsAt: phase.startsAt ?? null,
                    endsAt: phase.endsAt ?? null,
                    sortOrder: phase.sortOrder,
                    active: phase.active,
                },
            })
        );
    }

    return phases;
}

async function writeRaceVersion(store, { raceDefinitionId, snapshot, actorId, reason }) {
    const latest = await store.erichRaceVersion.findFirst({
        where: { raceDefinitionId },
        orderBy: { version: "desc" },
        select: { version: true },
    });

    return store.erichRaceVersion.create({
        data: {
            raceDefinitionId,
            version: (latest?.version ?? 0) + 1,
            snapshot,
            changeReason: reason,
            createdById: actorId,
        },
    });
}

async function upsertRaceDefinition(store, { eventId, race, actorId, reason }) {
    const nextData = raceDefinitionData({ eventId, race });
    const existing = await store.erichRaceDefinition.findUnique({
        where: {
            eventId_raceNumber: {
                eventId,
                raceNumber: race.raceNumber,
            },
        },
    });

    const raceDefinition = await store.erichRaceDefinition.upsert({
        where: {
            eventId_raceNumber: {
                eventId,
                raceNumber: race.raceNumber,
            },
        },
        create: nextData,
        update: {
            gender: nextData.gender,
            classLabel: nextData.classLabel,
            distanceLabel: nextData.distanceLabel,
            includesErich: nextData.includesErich,
            includesDm: nextData.includesDm,
            includesMdm: nextData.includesMdm,
            isLightweight: nextData.isLightweight,
            isPara: nextData.isPara,
            isTeamRace: nextData.isTeamRace,
            requiredTeamSize: nextData.requiredTeamSize,
            sameClubRequired: nextData.sameClubRequired,
            mixedClubsAllowed: nextData.mixedClubsAllowed,
            maleCount: nextData.maleCount,
            femaleCount: nextData.femaleCount,
            minimumBirthYear: nextData.minimumBirthYear,
            maximumBirthYear: nextData.maximumBirthYear,
            higherAgeClassAllowed: nextData.higherAgeClassAllowed,
            higherAgeMinimumBirthYear: nextData.higherAgeMinimumBirthYear,
            status: nextData.status,
            reviewReason: nextData.reviewReason,
            sourceSheet: nextData.sourceSheet,
            sourceRow: nextData.sourceRow,
        },
    });

    if (hasRaceChanged(existing, nextData)) {
        await writeRaceVersion(store, {
            raceDefinitionId: raceDefinition.id,
            snapshot: comparableRaceSnapshot(nextData),
            actorId,
            reason,
        });
    }

    return {
        raceDefinition,
        action: existing ? (hasRaceChanged(existing, nextData) ? "updated" : "unchanged") : "created",
    };
}

async function upsertRacePrices(store, { raceDefinition, race, phaseByName }) {
    let priceCount = 0;

    for (const priceBlock of race.prices ?? []) {
        for (const phase of priceBlock.phases ?? []) {
            if (phase.amountCents === null || phase.amountCents === undefined) continue;

            const pricePhase = phaseByName.get(phase.phaseKey);
            if (!pricePhase) {
                throw structuredError({
                    code: "ERICH_IMPORT_PRICE_PHASE_NOT_FOUND",
                    message: "ERICH price phase could not be resolved.",
                    details: { phaseKey: phase.phaseKey },
                });
            }

            await store.erichRacePrice.upsert({
                where: {
                    raceDefinitionId_pricePhaseId_valuationLevel: {
                        raceDefinitionId: raceDefinition.id,
                        pricePhaseId: pricePhase.id,
                        valuationLevel: priceBlock.level,
                    },
                },
                create: {
                    raceDefinitionId: raceDefinition.id,
                    pricePhaseId: pricePhase.id,
                    valuationLevel: priceBlock.level,
                    amountCents: assertCentAmount(phase.amountCents),
                    currency: assertCurrency(priceBlock.currency ?? "EUR"),
                    sourceSheet: priceBlock.sourceSheet,
                    sourceRow: priceBlock.sourceRow,
                },
                update: {
                    amountCents: assertCentAmount(phase.amountCents),
                    currency: assertCurrency(priceBlock.currency ?? "EUR"),
                    sourceSheet: priceBlock.sourceSheet,
                    sourceRow: priceBlock.sourceRow,
                },
            });
            priceCount += 1;
        }
    }

    return priceCount;
}

export async function applyErichRaceMasterData(store, {
    eventId,
    dryRun,
    actorId = null,
    activePhaseKey = null,
    reason = "Apply ERICH race master data from Excel dry run",
    now = new Date(),
} = {}) {
    const normalizedEventId = normalizeRequiredId(eventId, "eventId");
    assertDryRunCanApply(dryRun);

    return store.$transaction(async (tx) => {
        const event = await tx.erichEvent.findUnique({
            where: { id: normalizedEventId },
            select: { id: true },
        });

        if (!event) {
            throw structuredError({
                code: "ERICH_EVENT_NOT_FOUND",
                message: "ERICH event was not found.",
            });
        }

        const phases = await ensureErichPricePhases(tx, {
            eventId: normalizedEventId,
            activePhaseKey,
            pricePhases: dryRun.pricePhases ?? [],
            now,
        });
        const phaseByName = new Map(phases.map((phase) => [phase.name, phase]));

        const counters = {
            createdRaceCount: 0,
            updatedRaceCount: 0,
            unchangedRaceCount: 0,
            activeRaceCount: 0,
            reviewRequiredRaceCount: 0,
            priceCount: 0,
        };

        for (const race of dryRun.races) {
            const { raceDefinition, action } = await upsertRaceDefinition(tx, {
                eventId: normalizedEventId,
                race,
                actorId,
                reason,
            });

            if (action === "created") counters.createdRaceCount += 1;
            if (action === "updated") counters.updatedRaceCount += 1;
            if (action === "unchanged") counters.unchangedRaceCount += 1;
            if (raceDefinition.status === "ACTIVE") counters.activeRaceCount += 1;
            if (raceDefinition.status === "REVIEW_REQUIRED") counters.reviewRequiredRaceCount += 1;

            counters.priceCount += await upsertRacePrices(tx, {
                raceDefinition,
                race,
                phaseByName,
            });
        }

        const importJob = await tx.erichImportJob.create({
            data: {
                eventId: normalizedEventId,
                importType: ERICH_RACE_MASTER_IMPORT_TYPE,
                status: "APPLIED",
                createdById: actorId,
                dryRunReport: summarizeDryRun(dryRun),
                appliedAt: new Date(),
            },
        });

        await tx.erichAuditLog.create({
            data: {
                eventId: normalizedEventId,
                actorId,
                entityType: "ErichImportJob",
                entityId: importJob.id,
                action: "import.race_master_data.applied",
                reason,
                oldValue: null,
                newValue: {
                    importType: ERICH_RACE_MASTER_IMPORT_TYPE,
                    activePhaseKey,
                    ...counters,
                },
                metadata: summarizeDryRun(dryRun),
            },
        });

        return {
            importJob,
            phases,
            ...counters,
        };
    });
}
