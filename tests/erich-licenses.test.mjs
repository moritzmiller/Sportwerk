import assert from "node:assert/strict";
import { test } from "node:test";

import {
    importErichLicenseRecords,
    normalizeErichLicenseRecordInput,
    recordManualEligibilityDecision,
} from "../src/lib/erich/licenses.js";

const admin = {
    id: "admin-1",
    role: "ADMIN",
};

test("ERICH license records normalize license numbers and date-only birth dates", () => {
    const record = normalizeErichLicenseRecordInput({
        licenseNumber: " drv 123 ",
        firstName: " Max ",
        lastName: " Mustermann ",
        birthDate: "2010-02-20",
        clubName: " Ruderverein Test ",
    });

    assert.equal(record.licenseNumber, "DRV123");
    assert.equal(record.firstName, "Max");
    assert.equal(record.lastName, "Mustermann");
    assert.equal(record.birthDate.toISOString(), "2010-02-20T00:00:00.000Z");
    assert.equal(record.clubName, "Ruderverein Test");
});

test("ERICH license records require a license number or complete identity", () => {
    assert.throws(
        () => normalizeErichLicenseRecordInput({ firstName: "Max" }),
        (error) => {
            assert.equal(error.code, "ERICH_LICENSE_RECORD_INCOMPLETE");
            return true;
        }
    );
});

function createLicenseImportStore({ athleteMatches = [] } = {}) {
    const calls = [];
    let recordId = 0;
    const tx = {
        erichLicenseImport: {
            create: async (args) => {
                calls.push(["erichLicenseImport.create", args]);
                return { id: "import-1", ...args.data };
            },
        },
        erichLicenseRecord: {
            create: async (args) => {
                calls.push(["erichLicenseRecord.create", args]);
                return { id: `record-${(recordId += 1)}`, ...args.data };
            },
        },
        erichAthlete: {
            findMany: async (args) => {
                calls.push(["erichAthlete.findMany", args]);
                if (args.where.germanLicenseNumber === "DRV123") return athleteMatches;
                if (args.where.firstName === "Max") return athleteMatches;
                return [];
            },
        },
        erichRaceEntryValuation: {
            updateMany: async (args) => {
                calls.push(["erichRaceEntryValuation.updateMany", args]);
                return { count: 2 };
            },
        },
        erichEligibilityDecision: {
            create: async (args) => {
                calls.push(["erichEligibilityDecision.create", args]);
                return { id: "decision-1", ...args.data };
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

test("ERICH license import auto-confirms matched athletes and pending valuations", async () => {
    const { store, calls } = createLicenseImportStore({
        athleteMatches: [{ id: "athlete-1" }],
    });

    const result = await importErichLicenseRecords(store, {
        user: admin,
        eventId: "event-1",
        rows: [{ licenseNumber: "DRV123", firstName: "Max", lastName: "Mustermann" }],
    });

    assert.equal(result.recordCount, 1);
    assert.equal(result.matchedAthleteCount, 1);
    assert.equal(result.updatedValuationCount, 2);
    assert.equal(calls.find(([name]) => name === "erichRaceEntryValuation.updateMany")[1].data.status, "AUTO_CONFIRMED");
    assert.equal(calls.find(([name]) => name === "erichEligibilityDecision.create")[1].data.automatic, true);
    assert.equal(calls.at(-1)[1].data.action, "license.import_applied");
});

test("ERICH license import keeps ambiguous athlete matches for manual review", async () => {
    const { store } = createLicenseImportStore({
        athleteMatches: [{ id: "athlete-1" }, { id: "athlete-2" }],
    });

    const result = await importErichLicenseRecords(store, {
        user: admin,
        eventId: "event-1",
        rows: [{ licenseNumber: "DRV123" }],
    });

    assert.equal(result.recordCount, 1);
    assert.equal(result.matchedAthleteCount, 0);
    assert.equal(result.ambiguousRecordCount, 1);
    assert.equal(result.updatedValuationCount, 0);
});

test("ERICH manual eligibility decisions update race-entry valuations and audit", async () => {
    const calls = [];
    const tx = {
        erichEligibilityDecision: {
            create: async (args) => {
                calls.push(["erichEligibilityDecision.create", args]);
                return { id: "decision-1", ...args.data };
            },
        },
        erichRaceEntryValuation: {
            updateMany: async (args) => {
                calls.push(["erichRaceEntryValuation.updateMany", args]);
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
    const store = {
        $transaction: async (callback) => callback(tx),
    };

    const result = await recordManualEligibilityDecision(store, {
        user: admin,
        eventId: "event-1",
        athleteId: "athlete-1",
        raceEntryId: "entry-1",
        status: "MANUAL_CONFIRMED",
        reason: "License checked manually",
    });

    assert.equal(result.updatedValuationCount, 1);
    assert.equal(calls[0][1].data.status, "MANUAL_CONFIRMED");
    assert.equal(calls[1][1].data.status, "MANUAL_CONFIRMED");
    assert.equal(calls[2][1].data.action, "eligibility.manual_decision_recorded");
});
