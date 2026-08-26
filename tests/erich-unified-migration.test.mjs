import assert from "node:assert/strict";
import test from "node:test";

import {
    applyUnifiedMigrationPlanFromErichBatch,
    buildErichEventLookup,
    buildErichBatchBookingLookup,
    buildUnifiedEventCreateDataFromErichEvent,
    ensureUnifiedEventForErichEvent,
    buildUnifiedBookingCreateDataFromErichBatch,
    buildUnifiedMigrationPlanFromErichBatch,
    buildUnifiedPaymentCreateDataFromErichPayment,
    buildUnifiedTicketCreateDataFromErichEntry,
    centsToEuros,
    mapErichPaymentProvider,
    mapErichRegistrationStatus,
} from "../src/lib/erich/unified-migration.js";

const raceEntry = {
    id: "race-entry-1",
    eventId: "erich-event-1",
    athleteId: "athlete-1",
    raceDefinitionId: "race-definition-1",
    raceNumber: 101,
    status: "ACTIVE",
    priceCents: 4000,
    currency: "EUR",
    targetTimeTotalMs: 450000,
    athlete: {
        firstName: "Ada",
        lastName: "Lovelace",
    },
    raceDefinition: {
        classLabel: "U17",
        distanceLabel: "1000m",
        gender: "FEMALE",
    },
    valuations: [{ level: "ERICH", status: "AUTO_CONFIRMED" }],
};

const teamEntry = {
    id: "team-entry-1",
    eventId: "erich-event-1",
    teamName: "Team Analytical",
    raceDefinitionId: "race-definition-2",
    raceNumber: 202,
    status: "ACTIVE",
    priceCents: 8000,
    currency: "EUR",
};

const payment = {
    id: "payment-1",
    registrationBatchId: "batch-1",
    provider: "STRIPE",
    providerPaymentId: "cs_test_1",
    amountCents: 12000,
    currency: "EUR",
    status: "SUCCESSFUL",
    createdAt: new Date("2026-08-26T09:00:00.000Z"),
    updatedAt: new Date("2026-08-26T09:05:00.000Z"),
    attempts: [
        {
            id: "attempt-1",
            providerAttemptId: "cs_test_1",
            status: "SUCCESSFUL",
            checkoutUrl: "https://stripe.test/checkout",
            providerPayload: { id: "cs_test_1" },
        },
    ],
};

const batch = {
    id: "batch-1",
    eventId: "erich-event-1",
    accountId: "user-1",
    status: "PAID",
    paidAt: new Date("2026-08-26T09:05:00.000Z"),
    createdAt: new Date("2026-08-26T08:00:00.000Z"),
    updatedAt: new Date("2026-08-26T09:05:00.000Z"),
    account: {
        id: "user-1",
        name: "Ada Lovelace",
        email: "ada@example.test",
        billingName: "Ada Lovelace",
        billingStreet: "Main Street 1",
        billingPostalCode: "01067",
        billingCity: "Dresden",
        billingCountry: "DE",
    },
    raceEntries: [raceEntry],
    teamEntries: [teamEntry],
    payments: [payment],
};

const erichEvent = {
    id: "erich-event-1",
    name: "ERICH 2026",
    slug: "erich-2026",
    status: "ACTIVE",
    startsAt: new Date("2026-09-05T08:00:00.000Z"),
    endsAt: new Date("2026-09-05T18:00:00.000Z"),
};

test("ERICH migration helpers map money and statuses to unified domain values", () => {
    assert.equal(centsToEuros(1234), 12.34);
    assert.equal(mapErichRegistrationStatus("PAID"), "PAID");
    assert.equal(mapErichRegistrationStatus("TEMPORARY"), "AWAITING_PAYMENT");
    assert.equal(mapErichPaymentProvider("BANK_TRANSFER"), "MANUAL");
    assert.equal(mapErichPaymentProvider("STRIPE"), "STRIPE");
});

test("ERICH batch maps to a unified booking create payload", () => {
    const booking = buildUnifiedBookingCreateDataFromErichBatch({
        batch,
        eventId: 42,
        ticketType: { id: "ticket-type-1", name: "Rennen" },
    });

    assert.equal(booking.eventId, 42);
    assert.equal(booking.attendeeId, "user-1");
    assert.equal(booking.purchaserEmail, "ada@example.test");
    assert.equal(booking.quantity, 2);
    assert.equal(booking.unitPrice, 60);
    assert.equal(booking.totalAmount, 120);
    assert.equal(booking.paymentMethod, "STRIPE");
    assert.equal(booking.paymentProvider, "STRIPE");
    assert.equal(booking.status, "PAID");
    assert.equal(booking.registrationData.eventType, "ERICH");
    assert.equal(booking.registrationData.raceEntries[0].raceNumber, 101);
    assert.equal(booking.registrationData.teamEntries[0].teamName, "Team Analytical");
});

test("ERICH event maps to a unified Event create payload with a legacy lookup marker", () => {
    const lookup = buildErichEventLookup("erich-event-1");
    assert.equal(lookup.eventType, "ERICH");
    assert.deepEqual(lookup.eventOptions.path, ["legacySource", "erichEventId"]);
    assert.equal(lookup.eventOptions.equals, "erich-event-1");

    const event = buildUnifiedEventCreateDataFromErichEvent({
        erichEvent,
        ownerId: "owner-1",
        now: new Date("2026-08-26T10:00:00.000Z"),
    });

    assert.equal(event.title, "ERICH 2026");
    assert.equal(event.category, "SPORT");
    assert.equal(event.eventType, "ERICH");
    assert.equal(event.status, "PUBLISHED");
    assert.equal(event.ownerId, "owner-1");
    assert.equal(event.eventOptions.legacySource.erichEventId, "erich-event-1");
    assert.equal(event.eventOptions.features.raceRegistration, true);
});

test("ERICH unified event helper creates missing mapped events and reuses existing ones", async () => {
    const calls = [];
    const tx = {
        event: {
            findFirst: async (args) => {
                calls.push(["event.findFirst", args]);
                return calls.filter(([name]) => name === "event.findFirst").length === 1
                    ? null
                    : { id: 42 };
            },
            create: async (args) => {
                calls.push(["event.create", args]);
                return { id: 42 };
            },
        },
    };

    const created = await ensureUnifiedEventForErichEvent(tx, {
        erichEvent,
        ownerId: "owner-1",
    });
    const reused = await ensureUnifiedEventForErichEvent(tx, {
        erichEvent,
        ownerId: "owner-1",
    });

    assert.equal(created.action, "created");
    assert.equal(created.event.id, 42);
    assert.equal(reused.action, "reused");
    assert.equal(calls.filter(([name]) => name === "event.create").length, 1);
});

test("ERICH payment maps to a unified payment create payload", () => {
    const unifiedPayment = buildUnifiedPaymentCreateDataFromErichPayment({
        payment,
        bookingId: "booking-1",
    });

    assert.equal(unifiedPayment.bookingId, "booking-1");
    assert.equal(unifiedPayment.provider, "STRIPE");
    assert.equal(unifiedPayment.method, "STRIPE");
    assert.equal(unifiedPayment.status, "SUCCEEDED");
    assert.equal(unifiedPayment.idempotencyKey, "erich-payment:payment-1");
    assert.equal(unifiedPayment.providerPayload.legacySource.paymentId, "payment-1");
});

test("ERICH race and team entries map to unified tickets with holder details", () => {
    const ticket = buildUnifiedTicketCreateDataFromErichEntry({
        entry: raceEntry,
        eventId: 42,
        bookingId: "booking-1",
        ticketNumber: 1,
    });

    assert.equal(ticket.eventId, 42);
    assert.equal(ticket.bookingId, "booking-1");
    assert.equal(ticket.holderName, "Ada Lovelace");
    assert.equal(ticket.holderDetails.raceNumber, 101);
    assert.equal(ticket.holderDetails.classLabel, "U17");

    const teamTicket = buildUnifiedTicketCreateDataFromErichEntry({
        entry: teamEntry,
        eventId: 42,
        bookingId: "booking-1",
        ticketNumber: 2,
    });

    assert.equal(teamTicket.holderName, "Team Analytical");
    assert.equal(teamTicket.holderDetails.legacySource.type, "ErichTeamEntry");
});

test("ERICH migration plan contains booking, latest payment and all tickets", () => {
    const plan = buildUnifiedMigrationPlanFromErichBatch({
        batch,
        eventId: 42,
        bookingId: "booking-1",
        ticketType: { id: "ticket-type-1", name: "Rennen" },
    });

    assert.equal(plan.booking.registrationData.legacySource.batchId, "batch-1");
    assert.equal(plan.payment.idempotencyKey, "erich-payment:payment-1");
    assert.equal(plan.tickets.length, 2);
    assert.deepEqual(
        plan.tickets.map((ticket) => ticket.ticketNumber),
        [1, 2]
    );
});

test("ERICH apply helper writes unified booking, reservation, tickets and payment once", async () => {
    const calls = [];
    const createdTickets = [];
    const tx = {
        booking: {
            findFirst: async (args) => {
                calls.push(["booking.findFirst", args]);
                return null;
            },
            create: async ({ data }) => {
                calls.push(["booking.create", data]);
                return { ...data, id: "booking-1" };
            },
        },
        event: {
            findUnique: async (args) => {
                calls.push(["event.findUnique", args]);
                return { id: 42, capacity: 100 };
            },
            updateMany: async (args) => {
                calls.push(["event.updateMany", args]);
                return { count: 1 };
            },
        },
        eventTicketType: {
            findUnique: async () => null,
            updateMany: async () => ({ count: 0 }),
        },
        ticket: {
            createMany: async ({ data, skipDuplicates }) => {
                calls.push(["ticket.createMany", { data, skipDuplicates }]);
                createdTickets.push(...data);
                return { count: data.length };
            },
        },
        payment: {
            findUnique: async (args) => {
                calls.push(["payment.findUnique", args]);
                return null;
            },
            create: async ({ data }) => {
                calls.push(["payment.create", data]);
                return { ...data, id: "payment-row-1" };
            },
        },
    };

    const result = await applyUnifiedMigrationPlanFromErichBatch(tx, {
        batch,
        eventId: 42,
    });

    assert.equal(result.action, "created");
    assert.equal(result.bookingId, "booking-1");
    assert.equal(result.ticketCount, 2);
    assert.equal(result.paymentAction, "created");
    assert.equal(createdTickets[0].bookingId, "booking-1");
    assert.equal(createdTickets[1].holderName, "Team Analytical");
    assert.ok(calls.some(([name]) => name === "event.updateMany"));
    assert.ok(calls.some(([name]) => name === "payment.create"));
});

test("ERICH apply helper skips already migrated batches by legacy lookup", async () => {
    const lookup = buildErichBatchBookingLookup("batch-1");
    assert.deepEqual(lookup.registrationData.path, ["legacySource", "batchId"]);
    assert.equal(lookup.registrationData.equals, "batch-1");

    const tx = {
        booking: {
            findFirst: async () => ({ id: "existing-booking" }),
        },
        ticket: {},
        payment: {},
    };

    const result = await applyUnifiedMigrationPlanFromErichBatch(tx, {
        batch,
        eventId: 42,
    });

    assert.equal(result.action, "skipped");
    assert.equal(result.reason, "booking-exists");
    assert.equal(result.bookingId, "existing-booking");
});
