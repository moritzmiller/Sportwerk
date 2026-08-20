import assert from "node:assert/strict";
import test from "node:test";

import { processMolliePaymentStatus } from "../src/lib/mollie-webhooks.js";

function createTx({ booking }) {
    const state = {
        booking,
        tickets: [],
        reservations: [],
    };

    return {
        state,
        booking: {
            async findFirst({ where }) {
                const matchesProvider = where.paymentProvider === booking.paymentProvider;
                const matchesBookingId = where.OR.some((item) => item.id === booking.id);
                const matchesPaymentId = where.OR.some(
                    (item) =>
                        item.providerPayload?.equals === booking.providerPayload?.paymentId ||
                        item.providerPayload?.equals === booking.providerPayload?.id
                );
                return matchesProvider && (matchesBookingId || matchesPaymentId) ? state.booking : null;
            },
            async updateMany({ data }) {
                if (state.booking.status !== "AWAITING_PAYMENT") return { count: 0 };
                state.booking = { ...state.booking, ...data };
                return { count: 1 };
            },
        },
        ticket: {
            async findMany() {
                return state.tickets;
            },
            async createMany({ data }) {
                state.tickets.push(...data);
                return { count: data.length };
            },
            async updateMany() {
                return { count: 0 };
            },
        },
        ticketType: {
            async updateMany() {
                return { count: 1 };
            },
        },
        promoCode: {
            async updateMany() {
                return { count: 0 };
            },
        },
    };
}

test("Mollie webhook status marks awaiting booking as paid", async () => {
    const tx = createTx({
        booking: {
            id: "booking_123",
            status: "AWAITING_PAYMENT",
            paymentProvider: "MOLLIE",
            paymentMethod: "MOLLIE_PAY_BY_BANK",
            providerPayload: {
                paymentId: "tr_mollie_123",
            },
            quantity: 1,
            eventId: 1,
            ticketTypeId: null,
            promoCodeId: null,
        },
    });

    const result = await processMolliePaymentStatus(tx, {
        paymentId: "tr_mollie_123",
        status: "SUCCEEDED",
        raw: {
            metadata: {
                bookingId: "booking_123",
            },
        },
    });

    assert.equal(result.action, "paid");
    assert.equal(tx.state.booking.status, "PAID");
    assert.equal(tx.state.booking.paymentProvider, "MOLLIE");
});

test("Mollie webhook status releases awaiting booking on cancelled payment", async () => {
    const tx = createTx({
        booking: {
            id: "booking_123",
            status: "AWAITING_PAYMENT",
            paymentProvider: "MOLLIE",
            providerPayload: {
                paymentId: "tr_mollie_123",
            },
            eventId: 1,
            ticketTypeId: null,
        },
    });

    const result = await processMolliePaymentStatus(tx, {
        paymentId: "tr_mollie_123",
        status: "CANCELLED",
        raw: {
            metadata: {
                bookingId: "booking_123",
            },
        },
    });

    assert.equal(result.action, "failed");
    assert.equal(tx.state.booking.status, "FAILED");
});

test("Mollie webhook status ignores pending states", async () => {
    const tx = createTx({
        booking: {
            id: "booking_123",
            status: "AWAITING_PAYMENT",
            paymentProvider: "MOLLIE",
            providerPayload: {
                paymentId: "tr_mollie_123",
            },
        },
    });

    const result = await processMolliePaymentStatus(tx, {
        paymentId: "tr_mollie_123",
        status: "PROCESSING",
        raw: {
            metadata: {
                bookingId: "booking_123",
            },
        },
    });

    assert.equal(result.action, "ignored");
    assert.equal(result.reason, "status-PROCESSING");
    assert.equal(tx.state.booking.status, "AWAITING_PAYMENT");
});
