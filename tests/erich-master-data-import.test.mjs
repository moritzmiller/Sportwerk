import assert from "node:assert/strict";
import { test } from "node:test";

import {
    applyErichRaceMasterData,
    buildPricePhaseData,
} from "../src/lib/erich/master-data-import.js";

function createDryRun() {
    return {
        summary: {
            raceCount: 2,
            duplicateRaceNumbers: [],
            activeRaceCount: 1,
            reviewRequiredRaceCount: 1,
        },
        pricePhases: [
            {
                name: "SEPT",
                sortOrder: 1,
                startsAt: null,
                endsAt: new Date("2027-09-30T00:00:00.000Z"),
            },
            {
                name: "OCT_NOV",
                sortOrder: 2,
                startsAt: new Date("2027-10-01T00:00:00.000Z"),
                endsAt: new Date("2027-11-30T00:00:00.000Z"),
            },
            {
                name: "DEC_JAN",
                sortOrder: 3,
                startsAt: new Date("2027-12-01T00:00:00.000Z"),
                endsAt: null,
            },
        ],
        races: [
            {
                raceNumber: 1,
                gender: "MALE",
                classLabel: "U17",
                distanceLabel: "1500m",
                includesErich: false,
                includesDm: true,
                includesMdm: true,
                isLightweight: false,
                isPara: false,
                isTeamRace: false,
                minimumBirthYear: 2009,
                maximumBirthYear: 2011,
                higherAgeClassAllowed: true,
                higherAgeMinimumBirthYear: 2010,
                sourceSheet: "Rennauswertung",
                sourceRow: 3,
                importStatus: "ACTIVE",
                issues: [],
                prices: [
                    {
                        level: "DM",
                        sourceSheet: "Startgeld",
                        sourceRow: 5,
                        phases: [
                            { phaseKey: "SEPT", amountCents: 2500 },
                            { phaseKey: "OCT_NOV", amountCents: 3000 },
                            { phaseKey: "DEC_JAN", amountCents: 3500 },
                        ],
                    },
                ],
            },
            {
                raceNumber: 10,
                gender: null,
                classLabel: null,
                distanceLabel: null,
                includesErich: false,
                includesDm: false,
                includesMdm: false,
                isLightweight: false,
                isPara: false,
                isTeamRace: false,
                sourceSheet: "Rennauswertung",
                sourceRow: 12,
                importStatus: "REVIEW_REQUIRED",
                issues: [
                    { code: "MISSING_PRIMARY_RACE_DEFINITION", severity: "blocker" },
                    { code: "MISSING_CHAMPIONSHIP_FLAG", severity: "blocker" },
                ],
                prices: [],
            },
        ],
    };
}

function createStore({ existingRaceOne = null } = {}) {
    const calls = [];
    const phases = new Map();
    const races = new Map();
    let raceId = 0;
    let versionId = 0;

    if (existingRaceOne) {
        races.set("event-1:1", existingRaceOne);
    }

    const tx = {
        erichEvent: {
            findUnique: async (args) => {
                calls.push(["erichEvent.findUnique", args]);
                return args.where.id === "event-1" ? { id: "event-1" } : null;
            },
        },
        erichPricePhase: {
            upsert: async (args) => {
                calls.push(["erichPricePhase.upsert", args]);
                const key = `${args.where.eventId_name.eventId}:${args.where.eventId_name.name}`;
                const phase = {
                    id: `phase-${args.where.eventId_name.name}`,
                    ...args.create,
                    ...(phases.has(key) ? args.update : {}),
                };
                phases.set(key, phase);
                return phase;
            },
        },
        erichRaceDefinition: {
            findUnique: async (args) => {
                calls.push(["erichRaceDefinition.findUnique", args]);
                const key = `${args.where.eventId_raceNumber.eventId}:${args.where.eventId_raceNumber.raceNumber}`;
                return races.get(key) ?? null;
            },
            upsert: async (args) => {
                calls.push(["erichRaceDefinition.upsert", args]);
                const key = `${args.where.eventId_raceNumber.eventId}:${args.where.eventId_raceNumber.raceNumber}`;
                const existing = races.get(key);
                const race = existing
                    ? { ...existing, ...args.update }
                    : { id: `race-${(raceId += 1)}`, ...args.create };
                races.set(key, race);
                return race;
            },
        },
        erichRaceVersion: {
            findFirst: async (args) => {
                calls.push(["erichRaceVersion.findFirst", args]);
                return null;
            },
            create: async (args) => {
                calls.push(["erichRaceVersion.create", args]);
                return { id: `version-${(versionId += 1)}`, ...args.data };
            },
        },
        erichRacePrice: {
            upsert: async (args) => {
                calls.push(["erichRacePrice.upsert", args]);
                return { id: "price-1", ...args.create, ...args.update };
            },
        },
        erichImportJob: {
            create: async (args) => {
                calls.push(["erichImportJob.create", args]);
                return { id: "import-1", ...args.data };
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

test("ERICH master data import builds stable price phases with one active phase", () => {
    assert.deepEqual(buildPricePhaseData({ eventId: "event-1", activePhaseKey: "OCT_NOV" }), [
        { eventId: "event-1", name: "SEPT", sortOrder: 1, active: false },
        { eventId: "event-1", name: "OCT_NOV", sortOrder: 2, active: true },
        { eventId: "event-1", name: "DEC_JAN", sortOrder: 3, active: false },
    ]);

    assert.throws(
        () => buildPricePhaseData({ eventId: "event-1", activePhaseKey: "APRIL" }),
        (error) => {
            assert.equal(error.code, "ERICH_IMPORT_INVALID_PRICE_PHASE");
            return true;
        }
    );

    const automaticPhases = buildPricePhaseData({
        eventId: "event-1",
        pricePhases: createDryRun().pricePhases,
        now: new Date("2027-10-15T10:00:00.000Z"),
    });

    assert.equal(automaticPhases.find((phase) => phase.name === "OCT_NOV").active, true);
    assert.equal(automaticPhases.find((phase) => phase.name === "SEPT").active, false);
});

test("ERICH master data import applies active and review-required races idempotently", async () => {
    const { store, calls } = createStore();
    const result = await applyErichRaceMasterData(store, {
        eventId: "event-1",
        actorId: "admin-1",
        dryRun: createDryRun(),
        now: new Date("2027-10-15T10:00:00.000Z"),
    });

    assert.equal(result.createdRaceCount, 2);
    assert.equal(result.updatedRaceCount, 0);
    assert.equal(result.unchangedRaceCount, 0);
    assert.equal(result.activeRaceCount, 1);
    assert.equal(result.reviewRequiredRaceCount, 1);
    assert.equal(result.priceCount, 3);
    assert.equal(result.importJob.status, "APPLIED");

    const raceCreates = calls
        .filter(([name]) => name === "erichRaceDefinition.upsert")
        .map(([, args]) => args.create);
    assert.equal(raceCreates[0].status, "ACTIVE");
    assert.equal(raceCreates[0].minimumBirthYear, 2009);
    assert.equal(raceCreates[0].maximumBirthYear, 2011);
    assert.equal(raceCreates[0].higherAgeClassAllowed, true);
    assert.equal(raceCreates[0].higherAgeMinimumBirthYear, 2010);
    assert.equal(raceCreates[1].status, "REVIEW_REQUIRED");
    assert.match(raceCreates[1].reviewReason, /MISSING_PRIMARY_RACE_DEFINITION/);

    assert.equal(calls.filter(([name]) => name === "erichPricePhase.upsert").length, 3);
    const phaseUpserts = calls
        .filter(([name]) => name === "erichPricePhase.upsert")
        .map(([, args]) => args.create);
    assert.equal(phaseUpserts.find((phase) => phase.name === "OCT_NOV").active, true);
    assert.equal(
        phaseUpserts.find((phase) => phase.name === "OCT_NOV").startsAt.toISOString(),
        "2027-10-01T00:00:00.000Z"
    );
    assert.equal(calls.filter(([name]) => name === "erichRacePrice.upsert").length, 3);
    assert.equal(calls.filter(([name]) => name === "erichRaceVersion.create").length, 2);
    assert.equal(calls.at(-1)[0], "erichAuditLog.create");
});

test("ERICH master data import rejects duplicate race numbers before writes", async () => {
    const { store, calls } = createStore();
    const dryRun = createDryRun();
    dryRun.summary.duplicateRaceNumbers = [1];

    await assert.rejects(
        () => applyErichRaceMasterData(store, { eventId: "event-1", dryRun }),
        (error) => {
            assert.equal(error.code, "ERICH_IMPORT_DUPLICATE_RACE_NUMBERS");
            return true;
        }
    );

    assert.equal(calls.length, 0);
});

test("ERICH master data import leaves unchanged existing races without a new version", async () => {
    const existingRaceOne = {
        id: "race-existing",
        eventId: "event-1",
        raceNumber: 1,
        gender: "MALE",
        classLabel: "U17",
        distanceLabel: "1500m",
        includesErich: false,
        includesDm: true,
        includesMdm: true,
        isLightweight: false,
        isPara: false,
        isTeamRace: false,
        minimumBirthYear: 2009,
        maximumBirthYear: 2011,
        higherAgeClassAllowed: true,
        higherAgeMinimumBirthYear: 2010,
        status: "ACTIVE",
        reviewReason: null,
        sourceSheet: "Rennauswertung",
        sourceRow: 3,
    };
    const { store, calls } = createStore({ existingRaceOne });

    const result = await applyErichRaceMasterData(store, {
        eventId: "event-1",
        dryRun: createDryRun(),
    });

    assert.equal(result.createdRaceCount, 1);
    assert.equal(result.updatedRaceCount, 0);
    assert.equal(result.unchangedRaceCount, 1);
    assert.equal(calls.filter(([name]) => name === "erichRaceVersion.create").length, 1);
});
