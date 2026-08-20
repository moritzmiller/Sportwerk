import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertCanCreateRaceEntry,
    createRaceEntryForRegistrationBatch,
    createRaceEntryWithValuations,
    isDuplicateRaceEntryError,
    removeRaceEntryFromRegistrationBatch,
} from "../src/lib/erich/race-entry-service.js";

const user = { id: "user-1", role: "VISITOR", erichRoleAssignments: [] };
const batch = {
    id: "batch-1",
    eventId: "event-1",
    accountId: "user-1",
    status: "TEMPORARY",
    expiresAt: new Date("2026-09-01T10:15:00.000Z"),
};
const athlete = {
    id: "athlete-1",
    accountId: "user-1",
    gender: "MALE",
    birthYear: 2010,
    lightweight: false,
    parasport: false,
};
const raceDefinition = {
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
const club = {
    isGermanClub: true,
    isCentralGermanClub: true,
    stateAssociationMember: true,
};
const prices = [
    {
        level: "ERICH",
        currency: "EUR",
        phases: [{ phaseKey: "DEC_JAN", amountCents: 4000 }],
    },
];
const targetTime = { minutes: 6, seconds: 59, milliseconds: 123 };
const now = new Date("2026-09-01T10:00:00.000Z");

function createTx({ createRaceEntryError = null, deleteManyResult = null } = {}) {
    const calls = [];

    const tx = {
        calls,
        erichRaceEntry: {
            create: async (args) => {
                calls.push(["erichRaceEntry.create", args]);
                if (createRaceEntryError) throw createRaceEntryError;
                return { id: "entry-1", ...args.data };
            },
        },
        erichRaceEntryValuation: {
            createMany: async (args) => {
                calls.push(["erichRaceEntryValuation.createMany", args]);
                return { count: args.data.length };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };

    if (deleteManyResult) {
        tx.erichRaceEntry.deleteMany = async (args) => {
            calls.push(["erichRaceEntry.deleteMany", args]);
            return deleteManyResult;
        };
    }

    return tx;
}

function createRaceEntryStore({
    batchRecord = batch,
    athleteRecord = { ...athlete, club },
    raceRecord = {
        ...raceDefinition,
        prices: [
            {
                valuationLevel: "ERICH",
                amountCents: 4000,
                currency: "EUR",
                pricePhase: { name: "DEC_JAN", active: true },
            },
        ],
    },
    existingEntries = [],
} = {}) {
    const tx = createTx();
    tx.erichRegistrationBatch = {
        findUnique: async (args) => {
            tx.calls.push(["erichRegistrationBatch.findUnique", args]);
            return batchRecord;
        },
    };
    tx.erichAthlete = {
        findUnique: async (args) => {
            tx.calls.push(["erichAthlete.findUnique", args]);
            return athleteRecord;
        },
    };
    tx.erichRaceDefinition = {
        findFirst: async (args) => {
            tx.calls.push(["erichRaceDefinition.findFirst", args]);
            return raceRecord;
        },
    };
    tx.erichRaceEntry.findMany = async (args) => {
        tx.calls.push(["erichRaceEntry.findMany", args]);
        return existingEntries;
    };
    tx.$transaction = async (callback) => callback(tx);
    return tx;
}

test("ERICH race entry service creates entry, valuation snapshots and audit in one transaction object", async () => {
    const tx = createTx();

    const result = await createRaceEntryWithValuations(tx, {
        user,
        batch,
        athlete,
        raceDefinition,
        club,
        prices,
        phaseKey: "DEC_JAN",
        targetTime,
        now,
    });

    assert.equal(result.raceEntry.id, "entry-1");
    assert.equal(result.raceEntry.priceCents, 4000);
    assert.equal(result.raceEntry.targetTimeTotalMs, 419123);

    assert.deepEqual(
        tx.calls.map(([name]) => name),
        ["erichRaceEntry.create", "erichRaceEntryValuation.createMany", "erichAuditLog.create"]
    );

    assert.deepEqual(tx.calls[0][1].data, {
        eventId: "event-1",
        registrationBatchId: "batch-1",
        athleteId: "athlete-1",
        raceDefinitionId: "race-1",
        raceNumber: 17,
        targetTimeMinutes: 6,
        targetTimeSeconds: 59,
        targetTimeMilliseconds: 123,
        targetTimeTotalMs: 419123,
        priceCents: 4000,
        currency: "EUR",
    });

    assert.deepEqual(
        tx.calls[1][1].data.map((row) => [row.raceEntryId, row.level, row.status]),
        [
            ["entry-1", "ERICH", "NOT_REQUIRED"],
            ["entry-1", "DM", "PENDING_IMPORT"],
            ["entry-1", "MDM", "PENDING_IMPORT"],
        ]
    );

    assert.equal(tx.calls[2][1].data.action, "race_entry.created");
    assert.equal(tx.calls[2][1].data.reason, "Rennmeldung durch berechtigten Account angelegt");
    assert.equal(tx.calls[2][1].data.newValue.raceNumber, 17);
});

test("ERICH race entry service rejects account mismatches before writing", async () => {
    const tx = createTx();

    assert.throws(
        () =>
            assertCanCreateRaceEntry({
                user,
                batch,
                athlete: { ...athlete, accountId: "other-user" },
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_ATHLETE_BATCH_ACCOUNT_MISMATCH");
            return true;
        }
    );

    await assert.rejects(
        () =>
            createRaceEntryWithValuations(tx, {
                user,
                batch,
                athlete: { ...athlete, accountId: "other-user" },
                raceDefinition,
                club,
                prices,
                phaseKey: "DEC_JAN",
                targetTime,
                now,
            }),
        /same account/
    );

    assert.deepEqual(tx.calls, []);
});

test("ERICH race entry service allows registration office users for managed batches", async () => {
    const tx = createTx();
    const officeUser = {
        id: "office-1",
        role: "VISITOR",
        erichRoleAssignments: [{ eventId: "event-1", role: "REGISTRATION_OFFICE" }],
    };

    const result = await createRaceEntryWithValuations(tx, {
        user: officeUser,
        batch,
        athlete,
        raceDefinition,
        club,
        prices,
        phaseKey: "DEC_JAN",
        targetTime,
        auditReason: "Meldestelle hat Eintrag nach Ruecksprache angelegt",
        now,
    });

    assert.equal(result.raceEntry.id, "entry-1");
    assert.equal(tx.calls[2][1].data.actorId, "office-1");
    assert.equal(tx.calls[2][1].data.reason, "Meldestelle hat Eintrag nach Ruecksprache angelegt");
});

test("ERICH race entry service maps Prisma duplicate race entry errors", async () => {
    const duplicateError = {
        code: "P2002",
        meta: { target: ["athleteId", "eventId", "raceNumber"] },
    };
    const tx = createTx({ createRaceEntryError: duplicateError });

    assert.equal(isDuplicateRaceEntryError(duplicateError), true);

    await assert.rejects(
        () =>
            createRaceEntryWithValuations(tx, {
                user,
                batch,
                athlete,
                raceDefinition,
                club,
                prices,
                phaseKey: "DEC_JAN",
                targetTime,
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_DUPLICATE_RACE_ENTRY");
            assert.equal(error.raceNumber, 17);
            return true;
        }
    );
});

test("ERICH race entry service maps Prisma adapter duplicate race entry errors", () => {
    assert.equal(
        isDuplicateRaceEntryError({
            code: "P2002",
            meta: { modelName: "ErichRaceEntry" },
            message:
                'Unique constraint failed on the fields: (`"athleteId"`, `"eventId"`, `"raceNumber"`)',
        }),
        true
    );
});

test("ERICH race entry service deletes stale duplicate race entries before insert", async () => {
    const tx = createTx({ deleteManyResult: { count: 1 } });

    await createRaceEntryWithValuations(tx, {
        user,
        batch,
        athlete,
        raceDefinition,
        club,
        prices,
        phaseKey: "DEC_JAN",
        targetTime,
        now,
    });

    assert.deepEqual(
        tx.calls.map(([name]) => name),
        [
            "erichRaceEntry.deleteMany",
            "erichRaceEntry.create",
            "erichRaceEntryValuation.createMany",
            "erichAuditLog.create",
        ]
    );
    assert.deepEqual(tx.calls[0][1], {
        where: {
            athleteId: "athlete-1",
            eventId: "event-1",
            raceNumber: 17,
            registrationBatchId: { not: "batch-1" },
            OR: [
                { registrationBatch: { status: { in: ["INVALID", "CANCELLED"] } } },
                {
                    registrationBatch: {
                        status: "TEMPORARY",
                        expiresAt: { lte: now },
                    },
                },
            ],
        },
    });
});

test("ERICH race entry service API helper loads context and creates an entry with active price phase", async () => {
    const store = createRaceEntryStore();

    const result = await createRaceEntryForRegistrationBatch(store, {
        user,
        batchId: "batch-1",
        athleteId: "athlete-1",
        raceDefinitionId: "race-1",
        targetTime,
        now,
    });

    assert.equal(result.raceEntry.id, "entry-1");
    assert.equal(result.draft.price.phaseKey, "DEC_JAN");
    assert.deepEqual(
        store.calls.map(([name]) => name),
        [
            "erichRegistrationBatch.findUnique",
            "erichAthlete.findUnique",
            "erichRaceDefinition.findFirst",
            "erichRaceEntry.findMany",
            "erichRaceEntry.create",
            "erichRaceEntryValuation.createMany",
            "erichAuditLog.create",
        ]
    );
});

test("ERICH race entry service resolves the phase from the current date window", async () => {
    const store = createRaceEntryStore({
        raceRecord: {
            ...raceDefinition,
            prices: [
                {
                    valuationLevel: "ERICH",
                    amountCents: 3400,
                    currency: "EUR",
                    pricePhase: {
                        name: "OCT_NOV",
                        active: false,
                        startsAt: new Date("2026-09-01T00:00:00.000Z"),
                        endsAt: new Date("2026-09-30T00:00:00.000Z"),
                    },
                },
            ],
        },
    });

    const result = await createRaceEntryForRegistrationBatch(store, {
        user,
        batchId: "batch-1",
        athleteId: "athlete-1",
        raceDefinitionId: "race-1",
        targetTime,
        now,
    });

    assert.equal(result.draft.price.phaseKey, "OCT_NOV");
    assert.equal(result.draft.price.amountCents, 3400);
});

test("ERICH race entry service API helper requires a resolvable price phase", async () => {
    const store = createRaceEntryStore({
        raceRecord: {
            ...raceDefinition,
            prices: [
                {
                    valuationLevel: "ERICH",
                    amountCents: 4000,
                    currency: "EUR",
                    pricePhase: { name: "SEPT", active: false },
                },
                {
                    valuationLevel: "ERICH",
                    amountCents: 3400,
                    currency: "EUR",
                    pricePhase: { name: "OCT_NOV", active: false },
                },
            ],
        },
    });

    await assert.rejects(
        () =>
            createRaceEntryForRegistrationBatch(store, {
                user,
                batchId: "batch-1",
                athleteId: "athlete-1",
                raceDefinitionId: "race-1",
                targetTime,
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_PRICE_PHASE_REQUIRED");
            return true;
        }
    );
});

test("ERICH race entry service API helper maps missing context and duplicate entries", async () => {
    await assert.rejects(
        () =>
            createRaceEntryForRegistrationBatch(createRaceEntryStore({ athleteRecord: null }), {
                user,
                batchId: "batch-1",
                athleteId: "missing-athlete",
                raceDefinitionId: "race-1",
                targetTime,
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_RACE_ENTRY_CONTEXT_NOT_FOUND");
            return true;
        }
    );

    await assert.rejects(
        () =>
            createRaceEntryForRegistrationBatch(
                createRaceEntryStore({ existingEntries: [{ raceNumber: 17 }] }),
                {
                    user,
                    batchId: "batch-1",
                    athleteId: "athlete-1",
                    raceDefinitionId: "race-1",
                    targetTime,
                    now,
                }
            ),
        (error) => {
            assert.equal(error.code, "ERICH_RACE_NOT_SELECTABLE");
            assert.deepEqual(error.reasonCodes, ["ALREADY_REGISTERED"]);
            return true;
        }
    );
});

test("ERICH race entry service API helper validates target time before querying", async () => {
    const store = createRaceEntryStore();

    await assert.rejects(
        () =>
            createRaceEntryForRegistrationBatch(store, {
                user,
                batchId: "batch-1",
                athleteId: "athlete-1",
                raceDefinitionId: "race-1",
                targetTime: { minutes: "fast", seconds: 2, milliseconds: 0 },
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_INVALID_TARGET_TIME");
            return true;
        }
    );

    assert.deepEqual(store.calls, []);
});

function createRemoveRaceEntryStore({ batchRecord = batch, entryRecord = null } = {}) {
    const calls = [];
    const raceEntry =
        entryRecord ??
        {
            id: "entry-1",
            eventId: "event-1",
            registrationBatchId: "batch-1",
            registrationBatch: batchRecord,
            athleteId: "athlete-1",
            athlete: {
                id: "athlete-1",
                accountId: "user-1",
                firstName: "Max",
                lastName: "Mustermann",
            },
            raceDefinitionId: "race-1",
            raceDefinition: {
                id: "race-1",
                raceNumber: 17,
                classLabel: "U17",
                distanceLabel: "1500m",
            },
            raceNumber: 17,
            targetTimeTotalMs: 419123,
            priceCents: 4000,
            currency: "EUR",
            valuations: [
                {
                    level: "ERICH",
                    status: "NOT_REQUIRED",
                    dependsOnLicenseCheck: false,
                },
            ],
        };
    const tx = {
        erichRaceEntry: {
            findUnique: async (args) => {
                calls.push(["erichRaceEntry.findUnique", args]);
                return raceEntry;
            },
            delete: async (args) => {
                calls.push(["erichRaceEntry.delete", args]);
                return raceEntry;
            },
        },
        erichRegistrationBatch: {
            updateMany: async (args) => {
                calls.push(["erichRegistrationBatch.updateMany", args]);
                return { count: 1 };
            },
        },
        erichPayment: {
            updateMany: async (args) => {
                calls.push(["erichPayment.updateMany", args]);
                return { count: 1 };
            },
        },
        erichPaymentAttempt: {
            updateMany: async (args) => {
                calls.push(["erichPaymentAttempt.updateMany", args]);
                return { count: 1 };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };

    return {
        calls,
        store: {
            $transaction: async (callback) => callback(tx),
        },
    };
}

test("ERICH race entry service removes editable draft entries and audits the old snapshot", async () => {
    const { store, calls } = createRemoveRaceEntryStore();

    const result = await removeRaceEntryFromRegistrationBatch(store, {
        user,
        batchId: "batch-1",
        raceEntryId: "entry-1",
        now,
    });

    assert.deepEqual(result, {
        removed: true,
        raceEntryId: "entry-1",
        registrationBatchId: "batch-1",
        raceNumber: 17,
    });
    assert.deepEqual(
        calls.map(([name]) => name),
        ["erichRaceEntry.findUnique", "erichRaceEntry.delete", "erichAuditLog.create"]
    );
    assert.equal(calls[2][1].data.action, "race_entry.removed_from_draft");
    assert.equal(calls[2][1].data.oldValue.raceNumber, 17);
});

test("ERICH race entry service reopens checkout before removing draft entries", async () => {
    const { store, calls } = createRemoveRaceEntryStore({
        batchRecord: { ...batch, status: "CHECKOUT" },
    });

    const result = await removeRaceEntryFromRegistrationBatch(store, {
        user,
        batchId: "batch-1",
        raceEntryId: "entry-1",
        now,
    });

    assert.equal(result.removed, true);
    assert.deepEqual(
        calls.map(([name]) => name),
        [
            "erichRaceEntry.findUnique",
            "erichRegistrationBatch.updateMany",
            "erichPayment.updateMany",
            "erichPaymentAttempt.updateMany",
            "erichRaceEntry.delete",
            "erichAuditLog.create",
        ]
    );
    assert.equal(calls[1][1].data.status, "TEMPORARY");
    assert.equal(calls[1][1].data.checkoutExpiresAt, null);
    assert.equal(calls[2][1].data.status, "CANCELLED");
    assert.equal(calls[5][1].data.metadata.reopenedCheckout, true);
});

test("ERICH race entry service hides entries outside the requested batch", async () => {
    const { store } = createRemoveRaceEntryStore({
        entryRecord: {
            id: "entry-1",
            registrationBatchId: "other-batch",
            registrationBatch: { ...batch, id: "other-batch" },
        },
    });

    await assert.rejects(
        () =>
            removeRaceEntryFromRegistrationBatch(store, {
                user,
                batchId: "batch-1",
                raceEntryId: "entry-1",
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_RACE_ENTRY_NOT_FOUND");
            return true;
        }
    );
});
