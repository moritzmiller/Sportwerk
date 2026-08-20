import { assertRaceIsActive } from "./race-entries.js";
import { evaluateChampionshipValuations, includedValuationLevels } from "./valuations.js";

export const ERICH_RACE_ELIGIBILITY_REASON_CODES = Object.freeze({
    RACE_NOT_ACTIVE: "RACE_NOT_ACTIVE",
    TEAM_RACE_NOT_INDIVIDUAL_FLOW: "TEAM_RACE_NOT_INDIVIDUAL_FLOW",
    ALREADY_REGISTERED: "ALREADY_REGISTERED",
    MISSING_ATHLETE_BIRTH_YEAR: "MISSING_ATHLETE_BIRTH_YEAR",
    BIRTH_YEAR_TOO_OLD: "BIRTH_YEAR_TOO_OLD",
    BIRTH_YEAR_TOO_YOUNG: "BIRTH_YEAR_TOO_YOUNG",
    HIGHER_AGE_CLASS_RULE_INCOMPLETE: "HIGHER_AGE_CLASS_RULE_INCOMPLETE",
    HIGHER_AGE_CLASS_MINIMUM_NOT_MET: "HIGHER_AGE_CLASS_MINIMUM_NOT_MET",
    GENDER_NOT_ALLOWED: "GENDER_NOT_ALLOWED",
    LIGHTWEIGHT_REQUIRED: "LIGHTWEIGHT_REQUIRED",
    PARASPORT_REQUIRED: "PARASPORT_REQUIRED",
    NO_AVAILABLE_VALUATION: "NO_AVAILABLE_VALUATION",
});

export const ERICH_RACE_SELECTION_MODE = Object.freeze({
    REGULAR: "REGULAR",
    HIGHER_AGE_CLASS: "HIGHER_AGE_CLASS",
});

function isIntegerOrNull(value) {
    return value === null || value === undefined || Number.isInteger(value);
}

function hasRegularBirthYearEligibility({ athlete, race }) {
    if (!Number.isInteger(athlete?.birthYear)) {
        return {
            eligible: false,
            reason: ERICH_RACE_ELIGIBILITY_REASON_CODES.MISSING_ATHLETE_BIRTH_YEAR,
        };
    }

    if (!isIntegerOrNull(race.minimumBirthYear) || !isIntegerOrNull(race.maximumBirthYear)) {
        throw new TypeError("race birth year boundaries must be integers when present.");
    }

    if (Number.isInteger(race.minimumBirthYear) && athlete.birthYear < race.minimumBirthYear) {
        return {
            eligible: false,
            reason: ERICH_RACE_ELIGIBILITY_REASON_CODES.BIRTH_YEAR_TOO_OLD,
        };
    }

    if (Number.isInteger(race.maximumBirthYear) && athlete.birthYear > race.maximumBirthYear) {
        return {
            eligible: false,
            reason: ERICH_RACE_ELIGIBILITY_REASON_CODES.BIRTH_YEAR_TOO_YOUNG,
        };
    }

    return { eligible: true };
}

function hasHigherAgeClassEligibility({ athlete, race }) {
    if (!race.higherAgeClassAllowed) {
        return { eligible: false };
    }

    if (!Number.isInteger(race.higherAgeMinimumBirthYear)) {
        return {
            eligible: false,
            reason: ERICH_RACE_ELIGIBILITY_REASON_CODES.HIGHER_AGE_CLASS_RULE_INCOMPLETE,
        };
    }

    // The ERICH requirement states "Jahrgang 2010 oder älter"; for birth years that
    // means the athlete must be born no later than the configured boundary year.
    if (athlete.birthYear > race.higherAgeMinimumBirthYear) {
        return {
            eligible: false,
            reason: ERICH_RACE_ELIGIBILITY_REASON_CODES.HIGHER_AGE_CLASS_MINIMUM_NOT_MET,
        };
    }

    return { eligible: true };
}

function evaluateBirthYearEligibility({ athlete, race }) {
    const regular = hasRegularBirthYearEligibility({ athlete, race });
    if (regular.eligible) {
        return {
            eligible: true,
            selectionMode: ERICH_RACE_SELECTION_MODE.REGULAR,
            reasonCodes: [],
        };
    }

    const higherAgeClass = hasHigherAgeClassEligibility({ athlete, race });
    if (higherAgeClass.eligible) {
        return {
            eligible: true,
            selectionMode: ERICH_RACE_SELECTION_MODE.HIGHER_AGE_CLASS,
            reasonCodes: [],
        };
    }

    return {
        eligible: false,
        selectionMode: null,
        reasonCodes: [higherAgeClass.reason ?? regular.reason].filter(Boolean),
    };
}

function evaluateGenderEligibility({ athlete, race }) {
    if (!race.gender || race.gender === "MIXED") return [];
    if (athlete?.gender === race.gender) return [];
    return [ERICH_RACE_ELIGIBILITY_REASON_CODES.GENDER_NOT_ALLOWED];
}

function evaluateAttributeEligibility({ athlete, race }) {
    const reasonCodes = [];

    if (race.isLightweight && !athlete?.lightweight) {
        reasonCodes.push(ERICH_RACE_ELIGIBILITY_REASON_CODES.LIGHTWEIGHT_REQUIRED);
    }

    if (race.isPara && !athlete?.parasport) {
        reasonCodes.push(ERICH_RACE_ELIGIBILITY_REASON_CODES.PARASPORT_REQUIRED);
    }

    return reasonCodes;
}

export function evaluateRaceEligibility({
    athlete,
    race,
    club,
    existingRaceNumbers = [],
    includeTeamRaces = false,
}) {
    if (!athlete) throw new Error("athlete is required.");
    if (!race) throw new Error("race is required.");

    const reasonCodes = [];

    try {
        assertRaceIsActive(race);
    } catch {
        reasonCodes.push(ERICH_RACE_ELIGIBILITY_REASON_CODES.RACE_NOT_ACTIVE);
    }

    if (race.isTeamRace && !includeTeamRaces) {
        reasonCodes.push(ERICH_RACE_ELIGIBILITY_REASON_CODES.TEAM_RACE_NOT_INDIVIDUAL_FLOW);
    }

    if (existingRaceNumbers.includes(race.raceNumber)) {
        reasonCodes.push(ERICH_RACE_ELIGIBILITY_REASON_CODES.ALREADY_REGISTERED);
    }

    const birthYear = evaluateBirthYearEligibility({ athlete, race });
    reasonCodes.push(...birthYear.reasonCodes);
    reasonCodes.push(...evaluateGenderEligibility({ athlete, race }));
    reasonCodes.push(...evaluateAttributeEligibility({ athlete, race }));

    const valuationDecisions = evaluateChampionshipValuations({ race, club });
    if (includedValuationLevels(valuationDecisions).length === 0) {
        reasonCodes.push(ERICH_RACE_ELIGIBILITY_REASON_CODES.NO_AVAILABLE_VALUATION);
    }

    return {
        raceNumber: race.raceNumber,
        eligible: reasonCodes.length === 0,
        selectionMode: reasonCodes.length === 0 ? birthYear.selectionMode : null,
        reasonCodes,
        valuationDecisions,
    };
}

export function listRaceEligibilityForAthlete({
    athlete,
    races,
    club,
    existingRaceNumbers = [],
    includeUnavailable = false,
    includeTeamRaces = false,
}) {
    if (!Array.isArray(races)) throw new TypeError("races must be an array.");

    return races
        .map((race) =>
            evaluateRaceEligibility({
                athlete,
                race,
                club,
                existingRaceNumbers,
                includeTeamRaces,
            })
        )
        .filter((result) => includeUnavailable || result.eligible)
        .sort((left, right) => left.raceNumber - right.raceNumber);
}
