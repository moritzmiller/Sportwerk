import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildErichExcelDryRun,
    euroValueToCents,
    normalizeRaceGender,
    parsePricePhases,
} from "../src/lib/erich/excel-import.js";

function emptyRows(count) {
    return Array.from({ length: count }, () => []);
}

function raceRow({
    raceNumber,
    gender,
    classLabel,
    distance,
    erich = null,
    dm = null,
    mdm = null,
    projectedStarters = null,
    minimumBirthYear = null,
    maximumBirthYear = null,
    higherAgeClassAllowed = null,
    higherAgeMinimumBirthYear = null,
    requiredTeamSize = null,
    sameClubRequired = null,
    mixedClubsAllowed = null,
    maleCount = null,
    femaleCount = null,
}) {
    return [
        raceNumber,
        gender,
        classLabel,
        distance,
        erich,
        dm,
        mdm,
        projectedStarters,
        minimumBirthYear,
        maximumBirthYear,
        higherAgeClassAllowed,
        higherAgeMinimumBirthYear,
        requiredTeamSize,
        sameClubRequired,
        mixedClubsAllowed,
        maleCount,
        femaleCount,
    ];
}

function priceRow({ raceNumber, erich = [], dm = [], mdm = [] }) {
    const row = Array.from({ length: 29 }, () => null);
    row[0] = raceNumber;
    erich.forEach((value, index) => {
        row[11 + index] = value;
    });
    dm.forEach((value, index) => {
        row[18 + index] = value;
    });
    mdm.forEach((value, index) => {
        row[26 + index] = value;
    });
    return row;
}

function phasePeriodRow() {
    const row = Array.from({ length: 29 }, () => null);
    row[11] = "bis 30.09.2027";
    row[12] = "01.10.2027 - 30.11.2027";
    row[13] = "ab 01.12.2027";
    return row;
}

test("ERICH Excel import converts Euro values to cent amounts", () => {
    assert.equal(euroValueToCents(10.5), 1050);
    assert.equal(euroValueToCents("12,75"), 1275);
    assert.equal(euroValueToCents("40.00"), 4000);
    assert.equal(euroValueToCents(null), null);
});

test("ERICH Excel import normalizes gender and lightweight markers", () => {
    assert.deepEqual(normalizeRaceGender("M"), { gender: "MALE", lightweight: false });
    assert.deepEqual(normalizeRaceGender("W LG"), { gender: "FEMALE", lightweight: true });
    assert.deepEqual(normalizeRaceGender("M/W"), { gender: "MIXED", lightweight: false });
});

test("ERICH Excel dry run keeps active races and flags unclear races for review", () => {
    const rennauswertungRows = [
        [],
        [],
        raceRow({
            raceNumber: 1,
            gender: "M",
            classLabel: 11,
            distance: "500m",
            mdm: "x",
            projectedStarters: 11,
            minimumBirthYear: 2009,
            maximumBirthYear: 2011,
            higherAgeClassAllowed: "x",
            higherAgeMinimumBirthYear: 2010,
        }),
        raceRow({
            raceNumber: 10,
            gender: null,
            classLabel: null,
            distance: null,
        }),
        raceRow({
            raceNumber: 132,
            gender: "M/W",
            classLabel: "Freizeit-Vierer (Fitness + Firmen)",
            distance: "500m (4x)",
            mdm: "x",
            requiredTeamSize: 4,
            sameClubRequired: "x",
            mixedClubsAllowed: "x",
            maleCount: 2,
            femaleCount: 2,
        }),
    ];
    const startgeldRows = [
        [],
        phasePeriodRow(),
        [],
        [],
        priceRow({ raceNumber: 1, mdm: [10.5, 12.75, 15] }),
        priceRow({ raceNumber: 10 }),
        priceRow({ raceNumber: 132 }),
    ];

    const dryRun = buildErichExcelDryRun({ rennauswertungRows, startgeldRows });

    assert.equal(dryRun.summary.raceCount, 3);
    assert.equal(dryRun.summary.activeRaceCount, 1);
    assert.equal(dryRun.summary.reviewRequiredRaceCount, 2);
    const raceOne = dryRun.races.find((race) => race.raceNumber === 1);
    assert.equal(raceOne.prices[0].phases[1].amountCents, 1275);
    assert.equal(raceOne.minimumBirthYear, 2009);
    assert.equal(raceOne.maximumBirthYear, 2011);
    assert.equal(raceOne.higherAgeClassAllowed, true);
    assert.equal(raceOne.higherAgeMinimumBirthYear, 2010);
    assert.deepEqual(
        dryRun.races.find((race) => race.raceNumber === 10).issues.map((issue) => issue.code),
        ["MISSING_PRIMARY_RACE_DEFINITION", "MISSING_CHAMPIONSHIP_FLAG"]
    );
    assert.ok(
        dryRun.races
            .find((race) => race.raceNumber === 132)
            .issues.some((issue) => issue.code === "MISSING_EXPECTED_PRICE_BLOCK")
    );
    const teamRace = dryRun.races.find((race) => race.raceNumber === 132);
    assert.equal(teamRace.requiredTeamSize, 4);
    assert.equal(teamRace.sameClubRequired, true);
    assert.equal(teamRace.mixedClubsAllowed, true);
    assert.equal(teamRace.maleCount, 2);
    assert.equal(teamRace.femaleCount, 2);
    assert.equal(dryRun.pricePhases[0].name, "SEPT");
    assert.equal(dryRun.pricePhases[0].endsAt.toISOString(), "2027-09-30T00:00:00.000Z");
    assert.equal(dryRun.pricePhases[1].startsAt.toISOString(), "2027-10-01T00:00:00.000Z");
    assert.equal(dryRun.pricePhases[1].endsAt.toISOString(), "2027-11-30T00:00:00.000Z");
    assert.equal(dryRun.pricePhases[2].startsAt.toISOString(), "2027-12-01T00:00:00.000Z");
});

test("ERICH Excel import reads price phase windows from Startgeld row two", () => {
    const phases = parsePricePhases([[], phasePeriodRow()]);

    assert.deepEqual(
        phases.map((phase) => ({
            name: phase.name,
            startsAt: phase.startsAt?.toISOString() ?? null,
            endsAt: phase.endsAt?.toISOString() ?? null,
        })),
        [
            { name: "SEPT", startsAt: null, endsAt: "2027-09-30T00:00:00.000Z" },
            {
                name: "OCT_NOV",
                startsAt: "2027-10-01T00:00:00.000Z",
                endsAt: "2027-11-30T00:00:00.000Z",
            },
            { name: "DEC_JAN", startsAt: "2027-12-01T00:00:00.000Z", endsAt: null },
        ]
    );
});

test("ERICH Excel dry run reports price blocks that do not match primary flags", () => {
    const dryRun = buildErichExcelDryRun({
        rennauswertungRows: [
            [],
            [],
            raceRow({
                raceNumber: 9,
                gender: "M",
                classLabel: "U17",
                distance: "1500m",
                dm: "x",
                mdm: "x",
            }),
        ],
        startgeldRows: [...emptyRows(4), priceRow({ raceNumber: 9, erich: [28, 34, 40] })],
    });

    const race = dryRun.races[0];
    assert.equal(race.expectedPriceLevel, "DM");
    assert.deepEqual(
        race.issues.map((issue) => issue.code),
        ["MISSING_EXPECTED_PRICE_BLOCK", "PRICE_BLOCK_WITHOUT_MATCHING_FLAG"]
    );
});
