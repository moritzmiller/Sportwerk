import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildCheckInCreateData,
    buildDocumentIssueData,
    buildExportJobCreateData,
    buildReducedScannerTicket,
    buildTicketCreateData,
    createErichTicketId,
    decideTicketCheckIn,
    scanErichTicket,
} from "../src/lib/erich/fulfillment.js";

const scannerUser = {
    id: "scanner-1",
    role: "VISITOR",
    erichRoleAssignments: [{ eventId: "event-1", role: "SCANNER" }],
};

function ticket(overrides = {}) {
    return {
        id: "ticket-row-1",
        eventId: "event-1",
        ticketId: "ERI-TEST",
        status: "ACTIVE",
        issuedAt: new Date("2026-09-01T10:00:00.000Z"),
        athlete: {
            id: "athlete-1",
            firstName: "Ada",
            lastName: "Lovelace",
            invoiceEmail: "hidden@example.com",
            parasport: true,
            club: { officialName: "Dresdner RC" },
        },
        raceEntry: {
            id: "entry-1",
            raceNumber: 101,
            status: "ACTIVE",
            priceCents: 4000,
            raceDefinition: {
                classLabel: "Open",
                distanceLabel: "2000 m",
                gender: "W",
            },
        },
        teamEntry: null,
        checkIns: [],
        ...overrides,
    };
}

test("ERICH ticket ids are random prefixed non-guessable values", () => {
    const first = createErichTicketId({ bytes: 12 });
    const second = createErichTicketId({ bytes: 12 });

    assert.match(first, /^ERI-[A-Z0-9_-]+$/);
    assert.notEqual(first, second);
});

test("ERICH ticket create data links race entries without exposing payment data", () => {
    assert.deepEqual(
        buildTicketCreateData({
            eventId: "event-1",
            ticketId: "ERI-STATIC",
            raceEntry: { id: "entry-1", athleteId: "athlete-1" },
        }),
        {
            eventId: "event-1",
            ticketId: "ERI-STATIC",
            athleteId: "athlete-1",
            raceEntryId: "entry-1",
            teamEntryId: null,
            status: "ACTIVE",
        }
    );
});

test("ERICH scanner ticket view is reduced and omits sensitive fields", () => {
    const reduced = buildReducedScannerTicket(ticket());

    assert.deepEqual(reduced, {
        ticketId: "ERI-TEST",
        status: "ACTIVE",
        issuedAt: new Date("2026-09-01T10:00:00.000Z"),
        athlete: {
            id: "athlete-1",
            firstName: "Ada",
            lastName: "Lovelace",
            clubName: "Dresdner RC",
        },
        raceEntry: {
            id: "entry-1",
            raceNumber: 101,
            status: "ACTIVE",
            classLabel: "Open",
            distanceLabel: "2000 m",
            gender: "W",
        },
        teamEntry: null,
    });
    assert.equal(JSON.stringify(reduced).includes("hidden@example.com"), false);
    assert.equal(JSON.stringify(reduced).includes("parasport"), false);
    assert.equal(JSON.stringify(reduced).includes("priceCents"), false);
});

test("ERICH check-in decisions reject duplicate or revoked tickets", () => {
    assert.deepEqual(decideTicketCheckIn({ ticket: ticket(), previousCheckIns: [] }), {
        accepted: true,
        status: "ACCEPTED",
        warning: null,
    });

    assert.deepEqual(
        decideTicketCheckIn({
            ticket: ticket(),
            previousCheckIns: [{ status: "ACCEPTED" }],
        }),
        {
            accepted: false,
            status: "DUPLICATE",
            warning: "already-checked-in",
        }
    );

    assert.deepEqual(decideTicketCheckIn({ ticket: ticket({ status: "REVOKED" }), previousCheckIns: [] }), {
        accepted: false,
        status: "REJECTED",
        warning: "ticket-REVOKED",
    });
});

test("ERICH check-in create data stores reduced ticket snapshot", () => {
    const now = new Date("2026-09-01T11:00:00.000Z");
    const decision = decideTicketCheckIn({ ticket: ticket(), previousCheckIns: [] });

    const data = buildCheckInCreateData({
        ticket: ticket(),
        decision,
        scannerId: "scanner-1",
        deviceId: "device-1",
        offlineId: "offline-1",
        now,
    });

    assert.equal(data.ticketId, "ticket-row-1");
    assert.equal(data.status, "ACCEPTED");
    assert.equal(data.syncStatus, "SYNCED");
    assert.equal(data.details.reducedTicket.athlete.clubName, "Dresdner RC");
});

test("ERICH document issues and export jobs have stable prepared records", () => {
    assert.deepEqual(
        buildDocumentIssueData({
            ticketId: "ticket-row-1",
            issuedById: "admin-1",
            source: "ADMIN",
            now: new Date("2026-09-01T10:00:00.000Z"),
        }),
        {
            ticketId: "ticket-row-1",
            status: "ISSUED",
            issuedAt: new Date("2026-09-01T10:00:00.000Z"),
            issuedById: "admin-1",
            source: "ADMIN",
        }
    );

    assert.deepEqual(
        buildExportJobCreateData({
            eventId: "event-1",
            exportType: "REGISTRATION_LIST",
            version: 1,
            requestedById: "admin-1",
            rowCount: 42,
            filters: { status: "PAID" },
        }),
        {
            eventId: "event-1",
            exportType: "REGISTRATION_LIST",
            version: 1,
            status: "PREPARED",
            requestedById: "admin-1",
            rowCount: 42,
            filters: { status: "PAID" },
        }
    );
});

test("ERICH scanner service writes check-in and audit with reduced response", async () => {
    const calls = [];
    const store = {
        calls,
        erichTicket: {
            findUnique: async (args) => {
                calls.push(["erichTicket.findUnique", args]);
                return ticket();
            },
        },
        erichCheckIn: {
            create: async (args) => {
                calls.push(["erichCheckIn.create", args]);
                return { id: "check-in-1", ...args.data };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };

    const result = await scanErichTicket(store, {
        user: scannerUser,
        ticketId: "ERI-TEST",
        now: new Date("2026-09-01T11:00:00.000Z"),
    });

    assert.equal(result.decision.status, "ACCEPTED");
    assert.equal(result.checkIn.id, "check-in-1");
    assert.equal(result.ticket.athlete.clubName, "Dresdner RC");
    assert.deepEqual(calls.map(([name]) => name), [
        "erichTicket.findUnique",
        "erichCheckIn.create",
        "erichAuditLog.create",
    ]);
});

