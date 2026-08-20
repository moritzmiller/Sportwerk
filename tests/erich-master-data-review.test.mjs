import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildRaceActivationBlockers,
    buildRaceReviewSummary,
    updateRaceDefinitionReview,
} from "../src/lib/erich/master-data-review.js";

function activeRace(overrides = {}) {
    return {
        id: "race-1",
        eventId: "event-1",
        raceNumber: 1,
        gender: "MALE",
        classLabel: "U17",
        distanceLabel: "1500m",
        includesErich: false,
        includesDm: true,
        includesMdm: true,
        status: "REVIEW_REQUIRED",
        reviewReason: "Excel review required",
        event: {
            id: "event-1",
            pricePhases: [
                { id: "phase-sept", name: "SEPT" },
                { id: "phase-oct", name: "OCT_NOV" },
            ],
        },
        prices: [
            {
                pricePhaseId: "phase-sept",
                valuationLevel: "DM",
                amountCents: 2500,
            },
            {
                pricePhaseId: "phase-oct",
                valuationLevel: "DM",
                amountCents: 3000,
            },
        ],
        ...overrides,
    };
}

function createReviewStore(race) {
    const calls = [];
    const store = {
        erichRaceDefinition: {
            findUnique: async (args) => {
                calls.push(["erichRaceDefinition.findUnique", args]);
                return args.where.id === race.id ? race : null;
            },
        },
        $transaction: async (callback) =>
            callback({
                erichRaceDefinition: {
                    update: async (args) => {
                        calls.push(["erichRaceDefinition.update", args]);
                        return {
                            ...race,
                            status: args.data.status,
                            reviewReason: args.data.reviewReason,
                        };
                    },
                },
                erichAuditLog: {
                    create: async (args) => {
                        calls.push(["erichAuditLog.create", args]);
                        return { id: "audit-1", ...args.data };
                    },
                },
            }),
    };

    return { store, calls };
}

test("ERICH race review reports activation blockers for incomplete master data", () => {
    const race = activeRace({
        gender: null,
        classLabel: null,
        distanceLabel: null,
        includesDm: false,
        includesMdm: false,
        prices: [],
    });

    assert.deepEqual(buildRaceActivationBlockers(race), [
        "MISSING_PRIMARY_RACE_DEFINITION",
        "MISSING_CHAMPIONSHIP_FLAG",
        "MISSING_BILLABLE_VALUATION_LEVEL",
    ]);
    assert.deepEqual(buildRaceReviewSummary(race), {
        canActivate: false,
        blockers: [
            "MISSING_PRIMARY_RACE_DEFINITION",
            "MISSING_CHAMPIONSHIP_FLAG",
            "MISSING_BILLABLE_VALUATION_LEVEL",
        ],
        billableLevel: null,
    });
});

test("ERICH race review blocks activation when phase prices are missing", async () => {
    const race = activeRace({
        prices: [
            {
                pricePhaseId: "phase-sept",
                valuationLevel: "DM",
                amountCents: 2500,
            },
        ],
    });
    const { store } = createReviewStore(race);

    await assert.rejects(
        () =>
            updateRaceDefinitionReview(store, {
                user: { id: "admin-1", role: "ADMIN" },
                raceDefinitionId: race.id,
                status: "ACTIVE",
                reason: "Reviewed ERICH master data",
            }),
        (error) => {
            assert.equal(error.code, "ERICH_RACE_ACTIVATION_BLOCKED");
            assert.deepEqual(error.blockers, ["MISSING_DM_PRICE_OCT_NOV"]);
            return true;
        }
    );
});

test("ERICH race review activates complete races and writes audit", async () => {
    const race = activeRace();
    const { store, calls } = createReviewStore(race);

    const result = await updateRaceDefinitionReview(store, {
        user: { id: "admin-1", role: "ADMIN" },
        raceDefinitionId: race.id,
        status: "ACTIVE",
        reason: "Reviewed ERICH master data",
    });

    assert.equal(result.raceDefinition.status, "ACTIVE");
    assert.equal(result.raceDefinition.reviewReason, null);
    assert.equal(result.review.canActivate, true);
    assert.deepEqual(
        calls.find(([name]) => name === "erichRaceDefinition.update")[1].data,
        {
            status: "ACTIVE",
            reviewReason: null,
        }
    );
    assert.equal(calls.at(-1)[0], "erichAuditLog.create");
    assert.equal(calls.at(-1)[1].data.action, "race_master_data.review_status_changed");
});

test("ERICH race review requires ERICH master-data permission", async () => {
    const race = activeRace();
    const { store } = createReviewStore(race);

    await assert.rejects(
        () =>
            updateRaceDefinitionReview(store, {
                user: { id: "user-1", role: "VISITOR" },
                raceDefinitionId: race.id,
                status: "INACTIVE",
                reason: "Hold race for review",
            }),
        (error) => {
            assert.equal(error.code, "ERICH_PERMISSION_DENIED");
            return true;
        }
    );
});
