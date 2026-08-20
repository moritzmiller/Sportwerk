import assert from "node:assert/strict";
import test from "node:test";
import {
    buildMaintenanceCutoffs,
    runMaintenanceCleanup,
} from "../src/lib/maintenance.js";

test("buildMaintenanceCutoffs derives stable retention cutoffs", () => {
    const now = new Date("2026-07-13T12:00:00.000Z");
    const cutoffs = buildMaintenanceCutoffs(now, {
        rateLimitHours: 2,
        systemEventDays: 10,
        scannerLinkDays: 3,
        eventSignalDays: 45,
    });

    assert.equal(cutoffs.rateLimitResetBefore.toISOString(), "2026-07-13T10:00:00.000Z");
    assert.equal(cutoffs.systemEventCreatedBefore.toISOString(), "2026-07-03T12:00:00.000Z");
    assert.equal(cutoffs.scannerLinkExpiredBefore.toISOString(), "2026-07-10T12:00:00.000Z");
    assert.equal(cutoffs.erichTemporaryDraftExpiredBefore.toISOString(), now.toISOString());
    assert.equal(cutoffs.eventSignalCreatedBefore.toISOString(), "2026-05-29T12:00:00.000Z");
});

test("runMaintenanceCleanup deletes only retained technical data", async () => {
    const calls = [];
    const store = {
        rateLimitBucket: {
            deleteMany: async (args) => {
                calls.push(["rateLimitBucket.deleteMany", args]);
                return { count: 7 };
            },
        },
        systemEvent: {
            deleteMany: async (args) => {
                calls.push(["systemEvent.deleteMany", args]);
                return { count: 3 };
            },
        },
        eventScannerLink: {
            deleteMany: async (args) => {
                calls.push(["eventScannerLink.deleteMany", args]);
                return { count: 2 };
            },
        },
        eventImpression: {
            deleteMany: async (args) => {
                calls.push(["eventImpression.deleteMany", args]);
                return { count: 11 };
            },
        },
        eventInteraction: {
            deleteMany: async (args) => {
                calls.push(["eventInteraction.deleteMany", args]);
                return { count: 13 };
            },
        },
    };

    const now = new Date("2026-07-13T12:00:00.000Z");
    const result = await runMaintenanceCleanup({
        store,
        now,
        retention: {
            rateLimitHours: 1,
            systemEventDays: 90,
            scannerLinkDays: 30,
            eventSignalDays: 180,
        },
    });

    assert.deepEqual(result.deleted, {
        rateLimitBuckets: 7,
        systemEvents: 3,
        scannerLinks: 2,
        erichTemporaryBatches: 0,
        erichTemporaryAthletes: 0,
        erichTemporaryConsents: 0,
        eventImpressions: 11,
        eventInteractions: 13,
    });

    assert.deepEqual(calls[0], [
        "rateLimitBucket.deleteMany",
        {
            where: {
                resetAt: { lt: new Date("2026-07-13T11:00:00.000Z") },
            },
        },
    ]);
    assert.deepEqual(calls[1], [
        "systemEvent.deleteMany",
        {
            where: {
                createdAt: { lt: new Date("2026-04-14T12:00:00.000Z") },
            },
        },
    ]);
    assert.deepEqual(calls[2], [
        "eventScannerLink.deleteMany",
        {
            where: {
                OR: [
                    { expiresAt: { lt: new Date("2026-06-13T12:00:00.000Z") } },
                    { revokedAt: { lt: new Date("2026-06-13T12:00:00.000Z") } },
                ],
            },
        },
    ]);
    assert.deepEqual(calls[3], [
        "eventImpression.deleteMany",
        {
            where: {
                createdAt: { lt: new Date("2026-01-14T12:00:00.000Z") },
            },
        },
    ]);
    assert.deepEqual(calls[4], [
        "eventInteraction.deleteMany",
        {
            where: {
                createdAt: { lt: new Date("2026-01-14T12:00:00.000Z") },
            },
        },
    ]);
});

test("runMaintenanceCleanup deletes expired ERICH drafts and their temporary athletes", async () => {
    const calls = [];
    const expiredAt = new Date("2026-07-13T12:00:00.000Z");
    const createdAt = new Date("2026-07-13T11:45:00.000Z");
    const now = new Date("2026-07-13T12:01:00.000Z");
    const tx = {
        erichRegistrationBatch: {
            findMany: async (args) => {
                calls.push(["erichRegistrationBatch.findMany", args]);
                return [
                    {
                        id: "batch-1",
                        accountId: "user-1",
                        createdAt,
                        expiresAt: expiredAt,
                        raceEntries: [{ athleteId: "athlete-from-race" }],
                        teamEntries: [
                            {
                                members: [{ athleteId: "athlete-from-team" }],
                            },
                        ],
                    },
                ];
            },
            deleteMany: async (args) => {
                calls.push(["erichRegistrationBatch.deleteMany", args]);
                return { count: 1 };
            },
        },
        erichAthlete: {
            findMany: async (args) => {
                calls.push(["erichAthlete.findMany", args]);
                if (calls.filter(([name]) => name === "erichAthlete.findMany").length === 1) {
                    return [{ id: "athlete-without-entry" }];
                }

                return [
                    { id: "athlete-from-race" },
                    { id: "athlete-from-team" },
                    { id: "athlete-without-entry" },
                ];
            },
            deleteMany: async (args) => {
                calls.push(["erichAthlete.deleteMany", args]);
                return { count: 3 };
            },
        },
        erichConsentAcceptance: {
            deleteMany: async (args) => {
                calls.push(["erichConsentAcceptance.deleteMany", args]);
                return { count: 2 };
            },
        },
    };
    const store = {
        rateLimitBucket: {
            deleteMany: async () => ({ count: 0 }),
        },
        systemEvent: {
            deleteMany: async () => ({ count: 0 }),
        },
        eventScannerLink: {
            deleteMany: async () => ({ count: 0 }),
        },
        erichRegistrationBatch: tx.erichRegistrationBatch,
        erichAthlete: tx.erichAthlete,
        $transaction: async (callback) => callback(tx),
    };

    const result = await runMaintenanceCleanup({ store, now });

    assert.deepEqual(result.deleted, {
        rateLimitBuckets: 0,
        systemEvents: 0,
        scannerLinks: 0,
        erichTemporaryBatches: 1,
        erichTemporaryAthletes: 3,
        erichTemporaryConsents: 2,
        eventImpressions: 0,
        eventInteractions: 0,
    });

    assert.deepEqual(
        calls.map(([name]) => name),
        [
            "erichRegistrationBatch.findMany",
            "erichAthlete.findMany",
            "erichRegistrationBatch.deleteMany",
            "erichAthlete.findMany",
            "erichConsentAcceptance.deleteMany",
            "erichAthlete.deleteMany",
        ]
    );
    assert.deepEqual(calls[0][1].where, {
        status: "TEMPORARY",
        expiresAt: { lte: now },
    });
    assert.deepEqual(calls[1][1].where, {
        OR: [
            {
                accountId: "user-1",
                createdAt: {
                    gte: createdAt,
                    lte: expiredAt,
                },
            },
        ],
        raceEntries: { none: {} },
        teamMembers: { none: {} },
        tickets: { none: {} },
    });
    assert.deepEqual(calls[2][1].where, {
        id: { in: ["batch-1"] },
        status: "TEMPORARY",
        expiresAt: { lte: now },
    });
    assert.deepEqual(calls[4][1].where, {
        athleteId: { in: ["athlete-from-race", "athlete-from-team", "athlete-without-entry"] },
    });
});
