import { assertCentAmount, assertCurrency } from "./money.js";
import { ERICH_VALUATION_LEVELS } from "./valuations.js";

export const ERICH_PRICE_LEVEL_PRIORITY = Object.freeze([
    ERICH_VALUATION_LEVELS.ERICH,
    ERICH_VALUATION_LEVELS.DM,
    ERICH_VALUATION_LEVELS.MDM,
]);

export function getBillableValuationLevel(race) {
    if (!race) throw new Error("race is required.");
    if (race.includesErich) return ERICH_VALUATION_LEVELS.ERICH;
    if (race.includesDm) return ERICH_VALUATION_LEVELS.DM;
    if (race.includesMdm) return ERICH_VALUATION_LEVELS.MDM;
    return null;
}

export function findPriceForPhase({ prices, valuationLevel, phaseKey }) {
    if (!valuationLevel) {
        throw new Error("valuationLevel is required.");
    }
    if (!phaseKey) {
        throw new Error("phaseKey is required.");
    }

    const price = (prices ?? []).find((entry) => entry.level === valuationLevel);
    const phase = price?.phases?.find((entry) => entry.phaseKey === phaseKey);

    if (!phase || phase.amountCents === null || phase.amountCents === undefined) {
        throw new Error(`Missing ${valuationLevel} price for phase ${phaseKey}.`);
    }

    return {
        valuationLevel,
        phaseKey,
        amountCents: assertCentAmount(phase.amountCents),
        currency: assertCurrency(price.currency ?? "EUR"),
    };
}

export function calculateRaceEntryPrice({ race, prices, phaseKey }) {
    const valuationLevel = getBillableValuationLevel(race);
    if (!valuationLevel) {
        throw new Error(`Race ${race?.raceNumber ?? "unknown"} has no billable valuation level.`);
    }

    return {
        raceNumber: race.raceNumber,
        ...findPriceForPhase({ prices, valuationLevel, phaseKey }),
    };
}

export function calculateTeamPrice({ race, prices, phaseKey, teamSize }) {
    if (!Number.isInteger(teamSize) || teamSize <= 0) {
        throw new Error("teamSize must be a positive integer.");
    }

    const price = calculateRaceEntryPrice({ race, prices, phaseKey });

    return {
        ...price,
        teamSize,
        amountCents: assertCentAmount(price.amountCents),
    };
}
