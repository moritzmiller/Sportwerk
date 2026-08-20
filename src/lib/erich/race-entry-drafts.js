import { evaluateRaceEligibility } from "./eligibility.js";
import { calculateRaceEntryPrice } from "./pricing.js";
import { prepareRaceEntryInput } from "./race-entries.js";

function buildIneligibleRaceError({ raceNumber, reasonCodes }) {
    const error = new Error(
        `Race ${raceNumber ?? "unknown"} is not selectable for this athlete: ${reasonCodes.join(", ")}.`
    );
    error.code = "ERICH_RACE_NOT_SELECTABLE";
    error.reasonCodes = reasonCodes;
    return error;
}

export function prepareRaceEntryDraft({
    eventId,
    registrationBatchId,
    athlete,
    raceDefinition,
    club,
    prices,
    phaseKey,
    targetTime,
    existingRaceNumbers = [],
    currency = "EUR",
}) {
    const eligibility = evaluateRaceEligibility({
        athlete,
        race: raceDefinition,
        club,
        existingRaceNumbers,
    });

    if (!eligibility.eligible) {
        throw buildIneligibleRaceError({
            raceNumber: raceDefinition?.raceNumber,
            reasonCodes: eligibility.reasonCodes,
        });
    }

    const price = calculateRaceEntryPrice({
        race: raceDefinition,
        prices,
        phaseKey,
    });

    const raceEntry = prepareRaceEntryInput({
        eventId,
        registrationBatchId,
        athleteId: athlete.id,
        raceDefinition,
        targetTime,
        priceCents: price.amountCents,
        currency: currency ?? price.currency,
    });

    return {
        raceEntry,
        price,
        selectionMode: eligibility.selectionMode,
        valuations: eligibility.valuationDecisions.map((decision) => ({
            level: decision.level,
            status: decision.eligibilityStatus,
            dependsOnLicenseCheck: decision.dependsOnLicenseCheck,
            decisionSnapshot: {
                included: decision.included,
                reasonCodes: decision.reasonCodes,
                selectionMode: eligibility.selectionMode,
            },
        })),
    };
}
