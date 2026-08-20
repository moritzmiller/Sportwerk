import { assertCentAmount, assertCurrency } from "./money.js";

export const ERICH_RACE_STATUS = Object.freeze({
    ACTIVE: "ACTIVE",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
    INACTIVE: "INACTIVE",
});

export function assertRaceIsActive(raceDefinition) {
    if (!raceDefinition?.id) {
        throw new Error("race definition is required.");
    }

    if (raceDefinition.status !== ERICH_RACE_STATUS.ACTIVE) {
        const reason = raceDefinition.reviewReason
            ? ` ${raceDefinition.reviewReason}`
            : "";
        throw new Error(`Race ${raceDefinition.raceNumber ?? raceDefinition.id} is not active.${reason}`);
    }

    return raceDefinition;
}

export function buildRaceEntryUniqueKey({ athleteId, eventId, raceNumber }) {
    if (!athleteId || !eventId || !Number.isInteger(raceNumber)) {
        throw new Error("athleteId, eventId and integer raceNumber are required.");
    }

    return `${eventId}:${athleteId}:${raceNumber}`;
}

export function parseTargetTimeToMilliseconds({ minutes, seconds, milliseconds }) {
    const parts = { minutes, seconds, milliseconds };

    for (const [field, value] of Object.entries(parts)) {
        if (!Number.isInteger(value)) {
            throw new TypeError(`target time ${field} must be an integer.`);
        }
    }

    if (minutes < 0) throw new RangeError("target time minutes must not be negative.");
    if (seconds < 0 || seconds > 59) throw new RangeError("target time seconds must be between 0 and 59.");
    if (milliseconds < 0 || milliseconds > 999) {
        throw new RangeError("target time milliseconds must be between 0 and 999.");
    }

    return minutes * 60_000 + seconds * 1_000 + milliseconds;
}

export function prepareRaceEntryInput({
    eventId,
    registrationBatchId,
    athleteId,
    raceDefinition,
    targetTime,
    priceCents,
    currency = "EUR",
}) {
    assertRaceIsActive(raceDefinition);

    return {
        eventId,
        registrationBatchId,
        athleteId,
        raceDefinitionId: raceDefinition.id,
        raceNumber: raceDefinition.raceNumber,
        targetTimeMinutes: targetTime.minutes,
        targetTimeSeconds: targetTime.seconds,
        targetTimeMilliseconds: targetTime.milliseconds,
        targetTimeTotalMs: parseTargetTimeToMilliseconds(targetTime),
        priceCents: assertCentAmount(priceCents, "priceCents"),
        currency: assertCurrency(currency),
        uniqueKey: buildRaceEntryUniqueKey({
            athleteId,
            eventId,
            raceNumber: raceDefinition.raceNumber,
        }),
    };
}
