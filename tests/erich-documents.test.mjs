import assert from "node:assert/strict";
import { test } from "node:test";

import {
    generateErichAthleteTicketPdf,
    preparePaidErichRegistrationDocuments,
} from "../src/lib/erich/documents.js";

const now = new Date("2026-09-01T10:00:00.000Z");

function athlete(overrides = {}) {
    return {
        id: "athlete-1",
        firstName: "Ada",
        lastName: "Lovelace",
        birthYear: 1998,
        club: { officialName: "Dresdner RC", shortName: "DRC" },
        ...overrides,
    };
}

function raceEntry(overrides = {}) {
    return {
        id: "entry-1",
        eventId: "event-1",
        athleteId: "athlete-1",
        raceNumber: 7,
        status: "ACTIVE",
        targetTimeMinutes: 7,
        targetTimeSeconds: 21,
        targetTimeMilliseconds: 120,
        athlete: athlete(),
        raceDefinition: {
            raceNumber: 7,
            classLabel: "Junioren",
            distanceLabel: "2000 m",
            gender: "W",
        },
        tickets: [],
        ...overrides,
    };
}

function paidBatch(overrides = {}) {
    return {
        id: "batch-1",
        eventId: "event-1",
        accountId: "user-1",
        status: "PAID",
        account: {
            id: "user-1",
            email: "melder@example.com",
            name: "Melder",
        },
        event: {
            id: "event-1",
            name: "ERICH 2026",
            slug: "erich-2026",
            startsAt: now,
            timezone: "Europe/Berlin",
        },
        billingProfiles: [{ invoiceEmail: "rechnung@example.com" }],
        raceEntries: [raceEntry()],
        ...overrides,
    };
}

function createStore({ batch = paidBatch(), existingTicket = null } = {}) {
    const calls = [];
    const state = {
        ticket: existingTicket,
        emailMessages: [],
    };

    return {
        calls,
        erichRegistrationBatch: {
            findUnique: async (args) => {
                calls.push(["erichRegistrationBatch.findUnique", args]);
                return batch;
            },
        },
        erichTicket: {
            findFirst: async (args) => {
                calls.push(["erichTicket.findFirst", args]);
                return state.ticket;
            },
            create: async (args) => {
                calls.push(["erichTicket.create", args]);
                state.ticket = {
                    id: "ticket-row-1",
                    ticketId: "ERI-TEST",
                    documentIssues: [],
                    ...args.data,
                };
                return state.ticket;
            },
        },
        erichDocumentIssue: {
            upsert: async (args) => {
                calls.push(["erichDocumentIssue.upsert", args]);
                return { id: "issue-1", ...args.create };
            },
        },
        erichEmailMessage: {
            findMany: async (args) => {
                calls.push(["erichEmailMessage.findMany", args]);
                return state.emailMessages;
            },
            create: async (args) => {
                calls.push(["erichEmailMessage.create", args]);
                const message = { id: "message-1", ...args.data };
                state.emailMessages.push(message);
                return message;
            },
            update: async (args) => {
                calls.push(["erichEmailMessage.update", args]);
                return { id: args.where.id, ...args.data };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };
}

test("ERICH paid batch preparation creates tickets, document issues and one reporter email per athlete", async () => {
    const store = createStore();

    const result = await preparePaidErichRegistrationDocuments(store, {
        batchId: "batch-1",
        actorId: "user-1",
        now,
        origin: "https://gatekeeper.example",
    });

    assert.equal(result.action, "prepared");
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].ticketIds.length, 1);
    assert.match(result.documents[0].ticketIds[0], /^ERI-[A-Z0-9_-]+$/);
    assert.equal(result.documents[0].recipientEmail, "rechnung@example.com");

    assert.deepEqual(
        store.calls.map(([name]) => name),
        [
            "erichRegistrationBatch.findUnique",
            "erichTicket.findFirst",
            "erichTicket.create",
            "erichDocumentIssue.upsert",
            "erichEmailMessage.findMany",
            "erichEmailMessage.create",
            "erichAuditLog.create",
        ]
    );
});

test("ERICH ticket PDF generation returns a PDF buffer with race QR data", async () => {
    const pdf = await generateErichAthleteTicketPdf({
        batch: { id: "batch-1" },
        event: paidBatch().event,
        athlete: athlete(),
        raceEntries: [
            raceEntry({
                tickets: [{ ticketId: "ERI-TEST" }],
            }),
        ],
    });

    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 1000);
});
