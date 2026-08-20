import assert from "node:assert/strict";
import { test } from "node:test";

import {
    evaluateRaceEligibility,
    listRaceEligibilityForAthlete,
} from "../src/lib/erich/eligibility.js";

const baseAthlete = {
    id: "athlete-1",
    gender: "MALE",
    birthYear: 2010,
    lightweight: false,
    parasport: false,
};

const germanClub = {
    isGermanClub: true,
    isCentralGermanClub: true,
    stateAssociationMember: true,
};

const activeRace = {
    id: "race-1",
    raceNumber: 17,
    status: "ACTIVE",
    gender: "MALE",
    minimumBirthYear: 2009,
    maximumBirthYear: 2010,
    higherAgeClassAllowed: false,
    higherAgeMinimumBirthYear: null,
    isLightweight: false,
    isPara: false,
    isTeamRace: false,
    includesErich: true,
    includesDm: true,
    includesMdm: true,
};

test("ERICH race eligibility accepts a regular matching athlete and returns valuation decisions", () => {
    const result = evaluateRaceEligibility({
        athlete: baseAthlete,
        race: activeRace,
        club: germanClub,
    });

    assert.equal(result.eligible, true);
    assert.equal(result.selectionMode, "REGULAR");
    assert.deepEqual(result.reasonCodes, []);
    assert.deepEqual(
        result.valuationDecisions.filter((decision) => decision.included).map((decision) => decision.level),
        ["ERICH", "DM", "MDM"]
    );
});

test("ERICH race eligibility reports explainable reasons for unavailable races", () => {
    const result = evaluateRaceEligibility({
        athlete: { ...baseAthlete, gender: "FEMALE", birthYear: 2011 },
        race: { ...activeRace, status: "REVIEW_REQUIRED", isLightweight: true },
        club: germanClub,
        existingRaceNumbers: [17],
    });

    assert.equal(result.eligible, false);
    assert.deepEqual(result.reasonCodes, [
        "RACE_NOT_ACTIVE",
        "ALREADY_REGISTERED",
        "BIRTH_YEAR_TOO_YOUNG",
        "GENDER_NOT_ALLOWED",
        "LIGHTWEIGHT_REQUIRED",
    ]);
});

test("ERICH race eligibility allows configured higher age class starts only at the boundary", () => {
    const promoted = evaluateRaceEligibility({
        athlete: { ...baseAthlete, birthYear: 2010 },
        race: {
            ...activeRace,
            minimumBirthYear: 2007,
            maximumBirthYear: 2008,
            higherAgeClassAllowed: true,
            higherAgeMinimumBirthYear: 2010,
        },
        club: germanClub,
    });

    assert.equal(promoted.eligible, true);
    assert.equal(promoted.selectionMode, "HIGHER_AGE_CLASS");

    const tooYoung = evaluateRaceEligibility({
        athlete: { ...baseAthlete, birthYear: 2011 },
        race: {
            ...activeRace,
            minimumBirthYear: 2007,
            maximumBirthYear: 2008,
            higherAgeClassAllowed: true,
            higherAgeMinimumBirthYear: 2010,
        },
        club: germanClub,
    });

    assert.equal(tooYoung.eligible, false);
    assert.deepEqual(tooYoung.reasonCodes, ["HIGHER_AGE_CLASS_MINIMUM_NOT_MET"]);
});

test("ERICH race eligibility does not guess incomplete higher age class rules", () => {
    const result = evaluateRaceEligibility({
        athlete: { ...baseAthlete, birthYear: 2010 },
        race: {
            ...activeRace,
            minimumBirthYear: 2007,
            maximumBirthYear: 2008,
            higherAgeClassAllowed: true,
            higherAgeMinimumBirthYear: null,
        },
        club: germanClub,
    });

    assert.equal(result.eligible, false);
    assert.deepEqual(result.reasonCodes, ["HIGHER_AGE_CLASS_RULE_INCOMPLETE"]);
});

test("ERICH race eligibility requires a matching championship valuation for non-ERICH races", () => {
    const result = evaluateRaceEligibility({
        athlete: baseAthlete,
        race: {
            ...activeRace,
            includesErich: false,
            includesDm: false,
            includesMdm: true,
        },
        club: {
            isGermanClub: false,
            isCentralGermanClub: false,
            stateAssociationMember: false,
        },
    });

    assert.equal(result.eligible, false);
    assert.deepEqual(result.reasonCodes, ["NO_AVAILABLE_VALUATION"]);
});

test("ERICH race eligibility list can return only selectable races or all reasons", () => {
    const races = [
        { ...activeRace, raceNumber: 2 },
        { ...activeRace, raceNumber: 1, gender: "FEMALE" },
    ];

    assert.deepEqual(
        listRaceEligibilityForAthlete({
            athlete: baseAthlete,
            races,
            club: germanClub,
        }).map((result) => result.raceNumber),
        [2]
    );

    assert.deepEqual(
        listRaceEligibilityForAthlete({
            athlete: baseAthlete,
            races,
            club: germanClub,
            includeUnavailable: true,
        }).map((result) => [result.raceNumber, result.eligible]),
        [
            [1, false],
            [2, true],
        ]
    );
});
