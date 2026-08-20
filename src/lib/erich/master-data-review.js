import { writeErichAuditLog } from "./audit.js";
import { ERICH_PERMISSIONS, assertErichPermission } from "./permissions.js";
import { getBillableValuationLevel } from "./pricing.js";

export const ERICH_RACE_REVIEW_STATUSES = Object.freeze([
    "ACTIVE",
    "REVIEW_REQUIRED",
    "INACTIVE",
]);

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function normalizeStatus(value) {
    const status = String(value ?? "").trim().toUpperCase();
    if (!ERICH_RACE_REVIEW_STATUSES.includes(status)) {
        throw structuredError({
            code: "ERICH_RACE_REVIEW_STATUS_INVALID",
            message: "ERICH race review status is invalid.",
            details: { status },
        });
    }
    return status;
}

function normalizeReason(value) {
    return String(value ?? "").trim().slice(0, 700);
}

function hasPrimaryRaceFields(race) {
    return Boolean(race?.gender && race?.classLabel && race?.distanceLabel);
}

function hasChampionshipFlag(race) {
    return Boolean(race?.includesErich || race?.includesDm || race?.includesMdm);
}

function priceCoverageBlockers(race) {
    const blockers = [];
    const billableLevel = getBillableValuationLevel(race);
    const phases = race?.event?.pricePhases ?? [];

    if (!billableLevel) {
        blockers.push("MISSING_BILLABLE_VALUATION_LEVEL");
        return blockers;
    }

    if (phases.length === 0) {
        blockers.push("MISSING_PRICE_PHASES");
        return blockers;
    }

    for (const phase of phases) {
        const price = (race.prices ?? []).find(
            (entry) =>
                entry.valuationLevel === billableLevel &&
                entry.pricePhaseId === phase.id &&
                entry.amountCents > 0
        );

        if (!price) {
            blockers.push(`MISSING_${billableLevel}_PRICE_${phase.name}`);
        }
    }

    return blockers;
}

export function buildRaceActivationBlockers(race) {
    const blockers = [];

    if (!hasPrimaryRaceFields(race)) {
        blockers.push("MISSING_PRIMARY_RACE_DEFINITION");
    }

    if (!hasChampionshipFlag(race)) {
        blockers.push("MISSING_CHAMPIONSHIP_FLAG");
    }

    blockers.push(...priceCoverageBlockers(race));

    return blockers;
}

export function buildRaceReviewSummary(race) {
    const blockers = buildRaceActivationBlockers(race);

    return {
        canActivate: blockers.length === 0,
        blockers,
        billableLevel: getBillableValuationLevel(race),
    };
}

export function erichRaceReviewInclude() {
    return {
        event: {
            select: {
                id: true,
                name: true,
                pricePhases: {
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                    select: {
                        id: true,
                        name: true,
                        active: true,
                        sortOrder: true,
                    },
                },
            },
        },
        prices: {
            include: {
                pricePhase: {
                    select: {
                        id: true,
                        name: true,
                        active: true,
                        sortOrder: true,
                    },
                },
            },
            orderBy: [
                { pricePhase: { sortOrder: "asc" } },
                { valuationLevel: "asc" },
            ],
        },
    };
}

export async function updateRaceDefinitionReview(store, {
    user,
    raceDefinitionId,
    status,
    reason,
}) {
    if (!user?.id) {
        throw structuredError({
            code: "ERICH_AUTH_REQUIRED",
            message: "ERICH admin user is required.",
        });
    }

    const nextStatus = normalizeStatus(status);
    const normalizedReason = normalizeReason(reason);

    if (normalizedReason.length < 5) {
        throw structuredError({
            code: "ERICH_RACE_REVIEW_REASON_REQUIRED",
            message: "ERICH race review reason is required.",
        });
    }

    const race = await store.erichRaceDefinition.findUnique({
        where: { id: raceDefinitionId },
        include: erichRaceReviewInclude(),
    });

    if (!race) {
        throw structuredError({
            code: "ERICH_RACE_DEFINITION_NOT_FOUND",
            message: "ERICH race definition was not found.",
        });
    }

    assertErichPermission(user, ERICH_PERMISSIONS.MANAGE_RACE_MASTER_DATA, race.eventId);

    const activationBlockers = buildRaceActivationBlockers(race);
    if (nextStatus === "ACTIVE" && activationBlockers.length > 0) {
        throw structuredError({
            code: "ERICH_RACE_ACTIVATION_BLOCKED",
            message: "ERICH race cannot be activated before review blockers are resolved.",
            details: { blockers: activationBlockers },
        });
    }

    const updated = await store.$transaction(async (tx) => {
        const nextRace = await tx.erichRaceDefinition.update({
            where: { id: race.id },
            data: {
                status: nextStatus,
                reviewReason: nextStatus === "ACTIVE" ? null : normalizedReason,
            },
            include: erichRaceReviewInclude(),
        });

        await writeErichAuditLog({
            store: tx,
            eventId: race.eventId,
            actorId: user.id,
            entityType: "ErichRaceDefinition",
            entityId: race.id,
            action: "race_master_data.review_status_changed",
            reason: normalizedReason,
            oldValue: {
                status: race.status,
                reviewReason: race.reviewReason,
            },
            newValue: {
                status: nextRace.status,
                reviewReason: nextRace.reviewReason,
            },
            metadata: {
                raceNumber: race.raceNumber,
                activationBlockers,
            },
            critical: true,
        });

        return nextRace;
    });

    return {
        raceDefinition: updated,
        review: buildRaceReviewSummary(updated),
    };
}
