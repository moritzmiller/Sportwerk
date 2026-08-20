import { writeErichAuditLog } from "./audit.js";
import { assertErichPermission, canManageOwnErichRecord, ERICH_PERMISSIONS } from "./permissions.js";
import { prepareRaceEntryDraft } from "./race-entry-drafts.js";
import {
    assertRegistrationBatchCanBeEdited,
    ERICH_PAYMENT_STATUS,
    ERICH_REGISTRATION_WINDOWS_MS,
} from "./registration-batches.js";

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function addMs(date, durationMs) {
    return new Date(date.getTime() + durationMs);
}

export function isDuplicateRaceEntryError(error) {
    if (error?.code !== "P2002") return false;
    const target = error.meta?.target;
    const serializedTarget = Array.isArray(target) ? target.join(",") : String(target ?? "");
    const serializedMessage = String(error.message ?? "");

    const hasRaceEntryUniqueFields =
        serializedTarget.includes("athleteId") &&
        serializedTarget.includes("eventId") &&
        serializedTarget.includes("raceNumber");
    const messageHasRaceEntryUniqueFields =
        serializedMessage.includes("Unique constraint failed") &&
        serializedMessage.includes("athleteId") &&
        serializedMessage.includes("eventId") &&
        serializedMessage.includes("raceNumber");

    return (
        hasRaceEntryUniqueFields ||
        error.meta?.modelName === "ErichRaceEntry" ||
        messageHasRaceEntryUniqueFields
    );
}

export function assertCanCreateRaceEntry({ user, batch, athlete, now = new Date() }) {
    if (!user?.id) throw new Error("user is required.");
    if (!athlete?.id) throw new Error("athlete is required.");

    assertRegistrationBatchCanBeEdited({ batch, now });

    if (!canManageOwnErichRecord(user, batch)) {
        assertErichPermission(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, batch.eventId);
    }

    if (athlete.accountId !== batch.accountId) {
        throw structuredError({
            code: "ERICH_ATHLETE_BATCH_ACCOUNT_MISMATCH",
            message: "Athlete and registration batch must belong to the same account.",
            details: {
                athleteId: athlete.id,
                athleteAccountId: athlete.accountId,
                batchAccountId: batch.accountId,
            },
        });
    }

    return true;
}

function raceEntryCreateData(raceEntry) {
    const { uniqueKey, ...data } = raceEntry;
    return data;
}

async function deleteStaleDuplicateRaceEntries(tx, {
    athleteId,
    eventId,
    raceNumber,
    currentBatchId,
    now,
}) {
    if (typeof tx.erichRaceEntry?.deleteMany !== "function") return { count: 0 };

    return tx.erichRaceEntry.deleteMany({
        where: {
            athleteId,
            eventId,
            raceNumber,
            registrationBatchId: { not: currentBatchId },
            OR: [
                { registrationBatch: { status: { in: ["INVALID", "CANCELLED"] } } },
                {
                    registrationBatch: {
                        status: "TEMPORARY",
                        expiresAt: { lte: now },
                    },
                },
            ],
        },
    });
}

function normalizeRequiredId(value, fieldName) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw structuredError({
            code: "ERICH_REQUIRED_FIELD_MISSING",
            message: `${fieldName} is required.`,
            details: { fieldName },
        });
    }
    return normalized;
}

function normalizeTargetTime(targetTime) {
    const normalized = {
        minutes: Number(targetTime?.minutes),
        seconds: Number(targetTime?.seconds),
        milliseconds: Number(targetTime?.milliseconds ?? 0),
    };

    for (const [fieldName, value] of Object.entries(normalized)) {
        if (!Number.isInteger(value)) {
            throw structuredError({
                code: "ERICH_INVALID_TARGET_TIME",
                message: "Target time must contain integer minutes, seconds and milliseconds.",
                details: { fieldName },
            });
        }
    }

    return normalized;
}

function priceBlocksFromRaceDefinition(raceDefinition) {
    const byLevel = new Map();

    for (const price of raceDefinition?.prices ?? []) {
        const level = price.valuationLevel;
        if (!byLevel.has(level)) {
            byLevel.set(level, {
                level,
                currency: price.currency ?? "EUR",
                phases: [],
            });
        }

        byLevel.get(level).phases.push({
            phaseKey: price.pricePhase?.name,
            amountCents: price.amountCents,
        });
    }

    return [...byLevel.values()];
}

function phaseMatchesCurrentDate(phase, now = new Date()) {
    const currentTime = now.getTime();
    const startsAt = phase?.startsAt ? new Date(phase.startsAt).getTime() : null;
    const endsAt = phase?.endsAt ? new Date(phase.endsAt).getTime() : null;

    if (startsAt === null && endsAt === null) return false;
    if (startsAt !== null && currentTime < startsAt) return false;
    if (endsAt !== null && currentTime > endsAt) return false;
    return true;
}

function resolvePhaseKey({ requestedPhaseKey, raceDefinition, now = new Date() }) {
    if (requestedPhaseKey) return String(requestedPhaseKey).trim();

    const currentDatePhaseNames = [
        ...new Set(
            (raceDefinition?.prices ?? [])
                .filter((price) => phaseMatchesCurrentDate(price.pricePhase, now))
                .map((price) => price.pricePhase.name)
                .filter(Boolean)
        ),
    ];

    if (currentDatePhaseNames.length === 1) {
        return currentDatePhaseNames[0];
    }

    const activePhaseNames = [
        ...new Set(
            (raceDefinition?.prices ?? [])
                .filter((price) => price.pricePhase?.active)
                .map((price) => price.pricePhase.name)
                .filter(Boolean)
        ),
    ];

    if (activePhaseNames.length === 1) {
        return activePhaseNames[0];
    }

    throw structuredError({
        code: "ERICH_PRICE_PHASE_REQUIRED",
        message: "A price phase must be selected for this ERICH race entry.",
        details: { activePhaseCount: activePhaseNames.length },
    });
}

function mapRaceEntryDraftError(error) {
    if (error?.code) return error;

    if (/Missing .+ price for phase/i.test(error?.message ?? "")) {
        return structuredError({
            code: "ERICH_RACE_PRICE_MISSING",
            message: "ERICH race price is missing for the selected phase.",
        });
    }

    if (/target time/i.test(error?.message ?? "")) {
        return structuredError({
            code: "ERICH_INVALID_TARGET_TIME",
            message: error.message,
        });
    }

    return error;
}

export async function createRaceEntryWithValuations(tx, {
    user,
    batch,
    athlete,
    raceDefinition,
    club,
    prices,
    phaseKey,
    targetTime,
    existingRaceNumbers = [],
    auditReason = "Rennmeldung durch berechtigten Account angelegt",
    now = new Date(),
}) {
    assertCanCreateRaceEntry({ user, batch, athlete, now });

    await deleteStaleDuplicateRaceEntries(tx, {
        athleteId: athlete.id,
        eventId: batch.eventId,
        raceNumber: raceDefinition.raceNumber,
        currentBatchId: batch.id,
        now,
    });

    const draft = prepareRaceEntryDraft({
        eventId: batch.eventId,
        registrationBatchId: batch.id,
        athlete,
        raceDefinition,
        club,
        prices,
        phaseKey,
        targetTime,
        existingRaceNumbers,
    });

    try {
        const raceEntry = await tx.erichRaceEntry.create({
            data: raceEntryCreateData(draft.raceEntry),
        });

        const valuationRows = draft.valuations.map((valuation) => ({
            raceEntryId: raceEntry.id,
            level: valuation.level,
            status: valuation.status,
            dependsOnLicenseCheck: valuation.dependsOnLicenseCheck,
            decisionSnapshot: valuation.decisionSnapshot,
        }));

        if (valuationRows.length > 0) {
            await tx.erichRaceEntryValuation.createMany({
                data: valuationRows,
            });
        }

        await writeErichAuditLog({
            store: tx,
            eventId: batch.eventId,
            actorId: user.id,
            entityType: "ErichRaceEntry",
            entityId: raceEntry.id,
            action: "race_entry.created",
            reason: auditReason,
            oldValue: null,
            newValue: {
                athleteId: athlete.id,
                raceNumber: raceDefinition.raceNumber,
                targetTimeTotalMs: draft.raceEntry.targetTimeTotalMs,
                priceCents: draft.raceEntry.priceCents,
                currency: draft.raceEntry.currency,
                valuationLevels: draft.valuations.map((valuation) => valuation.level),
            },
            metadata: {
                registrationBatchId: batch.id,
                selectionMode: draft.selectionMode,
                price: draft.price,
            },
        });

        return {
            raceEntry,
            valuationRows,
            draft,
        };
    } catch (error) {
        if (isDuplicateRaceEntryError(error)) {
            throw structuredError({
                code: "ERICH_DUPLICATE_RACE_ENTRY",
                message: "Athlete is already registered for this race in this event.",
                details: {
                    athleteId: athlete.id,
                    eventId: batch.eventId,
                    raceNumber: raceDefinition.raceNumber,
                },
            });
        }

        throw error;
    }
}

export async function createRaceEntryForRegistrationBatch(store, {
    user,
    batchId,
    athleteId,
    raceDefinitionId,
    phaseKey = null,
    targetTime,
    auditReason,
    now = new Date(),
}) {
    const normalizedBatchId = normalizeRequiredId(batchId, "batchId");
    const normalizedAthleteId = normalizeRequiredId(athleteId, "athleteId");
    const normalizedRaceDefinitionId = normalizeRequiredId(raceDefinitionId, "raceDefinitionId");
    const normalizedTargetTime = normalizeTargetTime(targetTime);

    return store.$transaction(async (tx) => {
        const batch = await tx.erichRegistrationBatch.findUnique({
            where: { id: normalizedBatchId },
        });

        const athlete = await tx.erichAthlete.findUnique({
            where: { id: normalizedAthleteId },
            include: {
                club: true,
            },
        });

        if (!batch || !athlete) {
            throw structuredError({
                code: "ERICH_RACE_ENTRY_CONTEXT_NOT_FOUND",
                message: "ERICH registration batch or athlete was not found.",
            });
        }

        const raceDefinition = await tx.erichRaceDefinition.findFirst({
            where: {
                id: normalizedRaceDefinitionId,
                eventId: batch.eventId,
            },
            include: {
                prices: {
                    include: {
                        pricePhase: {
                            select: {
                                name: true,
                                active: true,
                                startsAt: true,
                                endsAt: true,
                            },
                        },
                    },
                },
            },
        });

        if (!raceDefinition) {
            throw structuredError({
                code: "ERICH_RACE_DEFINITION_NOT_FOUND",
                message: "ERICH race definition was not found for this event.",
            });
        }

        if (typeof tx.erichRegistrationBatch.deleteMany === "function") {
            await tx.erichRegistrationBatch.deleteMany({
                where: {
                    id: { not: batch.id },
                    eventId: batch.eventId,
                    accountId: batch.accountId,
                    status: "TEMPORARY",
                    expiresAt: { lte: now },
                },
            });
        }

        const existingEntries = await tx.erichRaceEntry.findMany({
            where: {
                eventId: batch.eventId,
                athleteId: athlete.id,
                status: "ACTIVE",
                registrationBatch: {
                    OR: [
                        { status: { in: ["CHECKOUT", "PAID", "COMPLETED"] } },
                        {
                            status: "TEMPORARY",
                            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                        },
                    ],
                },
            },
            select: {
                raceNumber: true,
            },
        });

        try {
            return await createRaceEntryWithValuations(tx, {
                user,
                batch,
                athlete,
                raceDefinition,
                club: athlete.club,
                prices: priceBlocksFromRaceDefinition(raceDefinition),
                phaseKey: resolvePhaseKey({ requestedPhaseKey: phaseKey, raceDefinition, now }),
                targetTime: normalizedTargetTime,
                existingRaceNumbers: existingEntries.map((entry) => entry.raceNumber),
                auditReason,
                now,
            });
        } catch (error) {
            throw mapRaceEntryDraftError(error);
        }
    });
}

export async function removeRaceEntryFromRegistrationBatch(store, {
    user,
    batchId,
    raceEntryId,
    auditReason = "Rennmeldung aus temporaerem ERICH-Draft entfernt",
    now = new Date(),
}) {
    const normalizedBatchId = normalizeRequiredId(batchId, "batchId");
    const normalizedRaceEntryId = normalizeRequiredId(raceEntryId, "raceEntryId");

    return store.$transaction(async (tx) => {
        const raceEntry = await tx.erichRaceEntry.findUnique({
            where: { id: normalizedRaceEntryId },
            include: {
                registrationBatch: true,
                athlete: {
                    select: {
                        id: true,
                        accountId: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                raceDefinition: {
                    select: {
                        id: true,
                        raceNumber: true,
                        classLabel: true,
                        distanceLabel: true,
                    },
                },
                valuations: {
                    select: {
                        level: true,
                        status: true,
                        dependsOnLicenseCheck: true,
                    },
                },
            },
        });

        if (!raceEntry || raceEntry.registrationBatchId !== normalizedBatchId) {
            throw structuredError({
                code: "ERICH_RACE_ENTRY_NOT_FOUND",
                message: "ERICH race entry was not found in this registration batch.",
            });
        }

        const batch = raceEntry.registrationBatch;
        const reopensCheckout = batch.status === "CHECKOUT";
        if (!reopensCheckout) {
            assertRegistrationBatchCanBeEdited({ batch, now });
        }

        if (!canManageOwnErichRecord(user, batch)) {
            assertErichPermission(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, batch.eventId);
        }

        if (reopensCheckout) {
            const reopenResult = await tx.erichRegistrationBatch.updateMany({
                where: {
                    id: batch.id,
                    status: "CHECKOUT",
                },
                data: {
                    status: "TEMPORARY",
                    expiresAt: addMs(now, ERICH_REGISTRATION_WINDOWS_MS.TEMPORARY_DRAFT),
                    checkoutExpiresAt: null,
                    submittedAt: null,
                },
            });

            if (reopenResult.count !== 1) {
                throw structuredError({
                    code: "ERICH_REGISTRATION_CHECKOUT_CONFLICT",
                    message: "ERICH checkout could not be reopened for editing.",
                });
            }

            await tx.erichPayment.updateMany({
                where: {
                    registrationBatchId: batch.id,
                    status: {
                        in: [
                            ERICH_PAYMENT_STATUS.OPEN,
                            ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
                            ERICH_PAYMENT_STATUS.PENDING,
                        ],
                    },
                },
                data: {
                    status: ERICH_PAYMENT_STATUS.CANCELLED,
                },
            });

            if (typeof tx.erichPaymentAttempt?.updateMany === "function") {
                await tx.erichPaymentAttempt.updateMany({
                    where: {
                        payment: {
                            registrationBatchId: batch.id,
                        },
                        status: {
                            in: [
                                ERICH_PAYMENT_STATUS.OPEN,
                                ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
                                ERICH_PAYMENT_STATUS.PENDING,
                            ],
                        },
                    },
                    data: {
                        status: ERICH_PAYMENT_STATUS.CANCELLED,
                    },
                });
            }
        }

        await tx.erichRaceEntry.delete({
            where: { id: raceEntry.id },
        });

        await writeErichAuditLog({
            store: tx,
            eventId: batch.eventId,
            actorId: user.id,
            entityType: "ErichRaceEntry",
            entityId: raceEntry.id,
            action: "race_entry.removed_from_draft",
            reason: auditReason,
            oldValue: {
                id: raceEntry.id,
                registrationBatchId: batch.id,
                athleteId: raceEntry.athleteId,
                athleteName: [raceEntry.athlete?.firstName, raceEntry.athlete?.lastName]
                    .filter(Boolean)
                    .join(" "),
                raceNumber: raceEntry.raceNumber,
                raceDefinitionId: raceEntry.raceDefinitionId,
                targetTimeTotalMs: raceEntry.targetTimeTotalMs,
                priceCents: raceEntry.priceCents,
                currency: raceEntry.currency,
                valuations: raceEntry.valuations,
            },
            newValue: null,
            metadata: {
                draftOnly: true,
                reopenedCheckout: reopensCheckout,
                raceDefinition: raceEntry.raceDefinition,
            },
        });

        return {
            removed: true,
            raceEntryId: raceEntry.id,
            registrationBatchId: batch.id,
            raceNumber: raceEntry.raceNumber,
        };
    });
}
