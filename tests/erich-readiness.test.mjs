import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildErichReadinessReport,
    loadErichReadinessReport,
} from "../src/lib/erich/readiness.js";

function completeRace(overrides = {}) {
    return {
        id: "race-1",
        raceNumber: 101,
        status: "ACTIVE",
        classLabel: "Open",
        distanceLabel: "2000 m",
        gender: "W",
        includesErich: true,
        includesDm: false,
        includesMdm: false,
        prices: [
            { pricePhaseId: "phase-1", valuationLevel: "ERICH", amountCents: 2800, currency: "EUR" },
            { pricePhaseId: "phase-2", valuationLevel: "ERICH", amountCents: 3400, currency: "EUR" },
            { pricePhaseId: "phase-3", valuationLevel: "ERICH", amountCents: 4000, currency: "EUR" },
        ],
        event: {
            pricePhases: [
                { id: "phase-1", phaseKey: "SEPT" },
                { id: "phase-2", phaseKey: "OCT_NOV" },
                { id: "phase-3", phaseKey: "DEC_JAN" },
            ],
        },
        ...overrides,
    };
}

test("ERICH readiness report blocks missing production master data", () => {
    const report = buildErichReadinessReport({
        event: { id: "event-1", status: "DRAFT" },
        races: [],
        pricePhases: [],
        clubs: [],
    });

    assert.equal(report.ready, false);
    assert.equal(report.issues.filter((issue) => issue.level === "ERROR").length, 5);
    assert.equal(report.metrics.activeRaceCount, 0);
});

test("ERICH readiness report allows complete active master data but warns on open operations", () => {
    const report = buildErichReadinessReport({
        event: { id: "event-1", status: "ACTIVE" },
        races: [completeRace(), completeRace({ id: "race-2", raceNumber: 132, status: "REVIEW_REQUIRED" })],
        pricePhases: [
            { id: "phase-1", active: true },
            { id: "phase-2", active: false },
            { id: "phase-3", active: false },
        ],
        clubs: [{ id: "club-1", active: true }],
        registrationBatches: [
            {
                id: "batch-1",
                status: "PAID",
                invoices: [],
                raceEntries: [{ id: "entry-1", tickets: [] }],
            },
        ],
        licenses: [{ id: "license-import-1", status: "UPLOADED" }],
        invoices: [],
        tickets: [],
        exportJobs: [],
    });

    assert.equal(report.ready, true);
    assert.equal(report.issues.some((issue) => issue.area === "races" && issue.level === "WARNING"), true);
    assert.equal(report.issues.some((issue) => issue.area === "billing" && issue.level === "WARNING"), true);
    assert.equal(report.issues.some((issue) => issue.area === "tickets" && issue.level === "WARNING"), true);
    assert.equal(report.issues.some((issue) => issue.area === "licenses" && issue.level === "WARNING"), true);
    assert.equal(report.metrics.registrationBatchesByStatus.PAID, 1);
});

test("ERICH readiness report catches active races with missing prices", () => {
    const report = buildErichReadinessReport({
        event: { id: "event-1", status: "ACTIVE" },
        races: [completeRace({ prices: [] })],
        pricePhases: [
            { id: "phase-1", active: true },
            { id: "phase-2", active: false },
            { id: "phase-3", active: false },
        ],
        clubs: [{ id: "club-1", active: true }],
    });

    assert.equal(report.ready, false);
    assert.equal(report.issues.some((issue) => issue.message.includes("activation blockers")), true);
});

test("ERICH readiness loader collects event-scoped data", async () => {
    const calls = [];
    const store = {
        erichEvent: {
            findUnique: async (args) => {
                calls.push(["erichEvent.findUnique", args]);
                return { id: "event-1", status: "ACTIVE" };
            },
        },
        erichRaceDefinition: {
            findMany: async (args) => {
                calls.push(["erichRaceDefinition.findMany", args]);
                return [completeRace()];
            },
        },
        erichPricePhase: {
            findMany: async (args) => {
                calls.push(["erichPricePhase.findMany", args]);
                return [{ id: "phase-1", active: true }];
            },
        },
        erichClub: {
            findMany: async (args) => {
                calls.push(["erichClub.findMany", args]);
                return [{ id: "club-1", active: true }];
            },
        },
        erichRegistrationBatch: {
            findMany: async (args) => {
                calls.push(["erichRegistrationBatch.findMany", args]);
                return [];
            },
        },
        erichLicenseImport: {
            findMany: async (args) => {
                calls.push(["erichLicenseImport.findMany", args]);
                return [];
            },
        },
        erichInvoice: {
            findMany: async (args) => {
                calls.push(["erichInvoice.findMany", args]);
                return [];
            },
        },
        erichTicket: {
            findMany: async (args) => {
                calls.push(["erichTicket.findMany", args]);
                return [];
            },
        },
        erichExportJob: {
            findMany: async (args) => {
                calls.push(["erichExportJob.findMany", args]);
                return [];
            },
        },
    };

    const report = await loadErichReadinessReport(store, { eventId: "event-1" });

    assert.equal(report.ready, true);
    assert.equal(calls[0][0], "erichEvent.findUnique");
    assert.deepEqual(calls[1][1].where, { eventId: "event-1" });
});
