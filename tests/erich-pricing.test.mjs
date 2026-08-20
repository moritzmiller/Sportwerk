import assert from "node:assert/strict";
import { test } from "node:test";

import {
    calculateRaceEntryPrice,
    calculateTeamPrice,
    findPriceForPhase,
    getBillableValuationLevel,
} from "../src/lib/erich/pricing.js";

const priceBlocks = [
    {
        level: "ERICH",
        phases: [
            { phaseKey: "SEPT", amountCents: 2800 },
            { phaseKey: "OCT_NOV", amountCents: 3400 },
            { phaseKey: "DEC_JAN", amountCents: 4000 },
        ],
    },
    {
        level: "DM",
        phases: [
            { phaseKey: "SEPT", amountCents: 1400 },
            { phaseKey: "OCT_NOV", amountCents: 1700 },
            { phaseKey: "DEC_JAN", amountCents: 2000 },
        ],
    },
    {
        level: "MDM",
        phases: [
            { phaseKey: "SEPT", amountCents: 1050 },
            { phaseKey: "OCT_NOV", amountCents: 1275 },
            { phaseKey: "DEC_JAN", amountCents: 1500 },
        ],
    },
];

test("ERICH price priority bills the highest championship level once", () => {
    assert.equal(
        getBillableValuationLevel({ includesErich: true, includesDm: true, includesMdm: true }),
        "ERICH"
    );
    assert.equal(
        getBillableValuationLevel({ includesErich: false, includesDm: true, includesMdm: true }),
        "DM"
    );
    assert.equal(
        getBillableValuationLevel({ includesErich: false, includesDm: false, includesMdm: true }),
        "MDM"
    );
});

test("ERICH race entry price selects one phase amount in cents", () => {
    assert.deepEqual(
        calculateRaceEntryPrice({
            race: { raceNumber: 17, includesErich: true, includesDm: true, includesMdm: true },
            prices: priceBlocks,
            phaseKey: "DEC_JAN",
        }),
        {
            raceNumber: 17,
            valuationLevel: "ERICH",
            phaseKey: "DEC_JAN",
            amountCents: 4000,
            currency: "EUR",
        }
    );

    assert.deepEqual(
        calculateRaceEntryPrice({
            race: { raceNumber: 65, includesErich: false, includesDm: true, includesMdm: true },
            prices: priceBlocks,
            phaseKey: "OCT_NOV",
        }),
        {
            raceNumber: 65,
            valuationLevel: "DM",
            phaseKey: "OCT_NOV",
            amountCents: 1700,
            currency: "EUR",
        }
    );
});

test("ERICH pricing fails when expected phase price is missing", () => {
    assert.throws(
        () =>
            findPriceForPhase({
                prices: [{ level: "MDM", phases: [{ phaseKey: "SEPT", amountCents: null }] }],
                valuationLevel: "MDM",
                phaseKey: "SEPT",
            }),
        /Missing MDM price/
    );
});

test("ERICH team price uses configured team price and keeps team size explicit", () => {
    const result = calculateTeamPrice({
        race: { raceNumber: 136, includesErich: false, includesDm: false, includesMdm: true },
        prices: [
            {
                level: "MDM",
                phases: [{ phaseKey: "DEC_JAN", amountCents: 12000 }],
            },
        ],
        phaseKey: "DEC_JAN",
        teamSize: 8,
    });

    assert.equal(result.amountCents, 12000);
    assert.equal(result.teamSize, 8);
});
