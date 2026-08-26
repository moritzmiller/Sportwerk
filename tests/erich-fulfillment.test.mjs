import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildCheckInCreateData,
    buildDocumentIssueData,
    buildExportJobCreateData,
    buildReducedScannerTicket,
    buildReducedUnifiedErichScannerTicket,
    buildTicketCreateData,
    createErichTicketId,
    decideUnifiedErichTicketCheckIn,
    decideTicketCheckIn,
    scanErichTicket,
} from "../src/lib/erich/fulfillment.js";
import { createIndividualTicketCode } from "../src/lib/tickets.js";

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

test("ERICH unified scanner ticket view is reduced and omits booking data", () => {
    const reduced = buildReducedUnifiedErichScannerTicket({
        id: "ticket-unified-1",
        status: "VALID",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        holderName: "Ada Lovelace",
        holderDetails: {
            legacySource: {
                type: "ErichRaceEntry",
                entryId: "entry-1",
                erichEventId: "event-1",
            },
            athleteId: "athlete-1",
            athleteName: "Ada Lovelace",
            raceNumber: 101,
            classLabel: "Open",
            distanceLabel: "2000 m",
            gender: "W",
            invoiceEmail: "hidden@example.com",
        },
        booking: {
            purchaserEmail: "hidden@example.com",
        },
    });

    assert.match(reduced.ticketId, /^gkt1\.ticket-unified-1\./);
    assert.equal(reduced.source, "UNIFIED");
    assert.equal(reduced.raceEntry.id, "entry-1");
    assert.equal(reduced.raceEntry.raceNumber, 101);
    assert.equal(JSON.stringify(reduced).includes("hidden@example.com"), false);
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

test("ERICH unified check-in decisions require paid valid unscanned tickets", () => {
    assert.deepEqual(
        decideUnifiedErichTicketCheckIn({
            ticket: {
                id: "ticket-unified-1",
                status: "VALID",
                checkedInAt: null,
                booking: { status: "PAID" },
            },
        }),
        {
            accepted: true,
            status: "ACCEPTED",
            warning: null,
        }
    );

    assert.deepEqual(
        decideUnifiedErichTicketCheckIn({
            ticket: {
                id: "ticket-unified-1",
                status: "CHECKED_IN",
                checkedInAt: new Date("2026-09-01T12:00:00.000Z"),
                booking: { status: "PAID" },
            },
        }),
        {
            accepted: false,
            status: "DUPLICATE",
            warning: "already-checked-in",
        }
    );

    assert.deepEqual(
        decideUnifiedErichTicketCheckIn({
            ticket: {
                id: "ticket-unified-1",
                status: "VALID",
                checkedInAt: null,
                booking: { status: "PENDING" },
            },
        }),
        {
            accepted: false,
            status: "REJECTED",
            warning: "booking-PENDING",
        }
    );
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

test("ERICH scanner service prefers synced unified tickets before legacy tickets", async () => {
    const calls = [];
    const now = new Date("2026-09-01T11:00:00.000Z");
    const unifiedCode = createIndividualTicketCode("ticket-unified-1");
    const store = {
        calls,
        ticket: {
            findUnique: async (args) => {
                calls.push(["ticket.findUnique", args]);
                return {
                    id: "ticket-unified-1",
                    eventId: 42,
                    bookingId: "booking-1",
                    holderName: "Ada Lovelace",
                    holderDetails: {
                        legacySource: {
                            type: "ErichRaceEntry",
                            entryId: "entry-1",
                            erichEventId: "event-1",
                        },
                        athleteId: "athlete-1",
                        athleteName: "Ada Lovelace",
                        raceNumber: 101,
                        classLabel: "Open",
                    },
                    status: "VALID",
                    checkedInAt: null,
                    createdAt: now,
                    booking: {
                        id: "booking-1",
                        eventId: 42,
                        purchaserName: "Ada Lovelace",
                        status: "PAID",
                        checkedInAt: null,
                    },
                    event: {
                        id: 42,
                        eventType: "ERICH",
                        eventOptions: {
                            legacySource: {
                                erichEventId: "event-1",
                            },
                        },
                    },
                };
            },
            updateMany: async (args) => {
                calls.push(["ticket.updateMany", args]);
                return { count: 1 };
            },
            count: async (args) => {
                calls.push(["ticket.count", args]);
                return 0;
            },
        },
        booking: {
            updateMany: async (args) => {
                calls.push(["booking.updateMany", args]);
                return { count: 1 };
            },
        },
        bookingScan: {
            create: async (args) => {
                calls.push(["bookingScan.create", args]);
                return { id: "scan-1", ...args.data };
            },
        },
        eventAuditLog: {
            create: async (args) => {
                calls.push(["eventAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
        erichTicket: {
            findUnique: async (args) => {
                calls.push(["erichTicket.findUnique", args]);
                return ticket();
            },
        },
    };

    const result = await scanErichTicket(store, {
        user: scannerUser,
        ticketId: unifiedCode,
        now,
    });

    assert.equal(result.decision.status, "ACCEPTED");
    assert.equal(result.checkIn.id, "scan-1");
    assert.equal(result.ticket.source, "UNIFIED");
    assert.equal(result.ticket.raceEntry.id, "entry-1");
    assert.deepEqual(calls.map(([name]) => name), [
        "ticket.findUnique",
        "ticket.updateMany",
        "bookingScan.create",
        "ticket.count",
        "booking.updateMany",
        "eventAuditLog.create",
    ]);
});

