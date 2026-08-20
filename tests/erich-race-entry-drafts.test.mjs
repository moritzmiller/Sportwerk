import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareRaceEntryDraft } from "../src/lib/erich/race-entry-drafts.js";

const athlete = {
    id: "athlete-1",
    gender: "FEMALE",
    birthYear: 2010,
    lightweight: true,
    parasport: false,
};

const raceDefinition = {
    id: "race-1",
    raceNumber: 42,
    status: "ACTIVE",
    gender: "FEMALE",
    minimumBirthYear: 2009,
    maximumBirthYear: 2010,
    higherAgeClassAllowed: false,
    higherAgeMinimumBirthYear: null,
    isLightweight: true,
    isPara: false,
    isTeamRace: false,
    includesErich: true,
    includesDm: true,
    includesMdm: false,
};

const club = {
    isGermanClub: true,
    isCentralGermanClub: false,
    stateAssociationMember: true,
};

const prices = [
    {
        level: "ERICH",
        currency: "EUR",
        phases: [{ phaseKey: "DEC_JAN", amountCents: 4000 }],
    },
];

test("ERICH race entry draft combines eligibility, price, target time and valuations", () => {
    const draft = prepareRaceEntryDraft({
        eventId: "event-1",
        registrationBatchId: "batch-1",
        athlete,
        raceDefinition,
        club,
        prices,
        phaseKey: "DEC_JAN",
        targetTime: { minutes: 7, seconds: 4, milliseconds: 99 },
    });

    assert.equal(draft.raceEntry.athleteId, "athlete-1");
    assert.equal(draft.raceEntry.raceNumber, 42);
    assert.equal(draft.raceEntry.priceCents, 4000);
    assert.equal(draft.raceEntry.targetTimeTotalMs, 424099);
    assert.equal(draft.price.valuationLevel, "ERICH");
    assert.equal(draft.selectionMode, "REGULAR");
    assert.deepEqual(
        draft.valuations.map((valuation) => [valuation.level, valuation.status]),
        [
            ["ERICH", "NOT_REQUIRED"],
            ["DM", "PENDING_IMPORT"],
        ]
    );
});

test("ERICH race entry draft fails before pricing when race is not selectable", () => {
    assert.throws(
        () =>
            prepareRaceEntryDraft({
                eventId: "event-1",
                registrationBatchId: "batch-1",
                athlete: { ...athlete, lightweight: false },
                raceDefinition,
                club,
                prices,
                phaseKey: "DEC_JAN",
                targetTime: { minutes: 7, seconds: 4, milliseconds: 99 },
            }),
        (error) => {
            assert.equal(error.code, "ERICH_RACE_NOT_SELECTABLE");
            assert.deepEqual(error.reasonCodes, ["LIGHTWEIGHT_REQUIRED"]);
            return true;
        }
    );
});

test("ERICH race entry draft protects against duplicate race numbers for the athlete", () => {
    assert.throws(
        () =>
            prepareRaceEntryDraft({
                eventId: "event-1",
                registrationBatchId: "batch-1",
                athlete,
                raceDefinition,
                club,
                prices,
                phaseKey: "DEC_JAN",
                targetTime: { minutes: 7, seconds: 4, milliseconds: 99 },
                existingRaceNumbers: [42],
            }),
        (error) => {
            assert.equal(error.code, "ERICH_RACE_NOT_SELECTABLE");
            assert.deepEqual(error.reasonCodes, ["ALREADY_REGISTERED"]);
            return true;
        }
    );
});
