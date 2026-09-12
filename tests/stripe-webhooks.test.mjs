import assert from "node:assert/strict";
import test from "node:test";

import { processStripeWebhookEvent } from "../src/lib/stripe-webhooks.js";

function createSessionEvent(type, overrides = {}) {
    return {
        type,
        data: {
            object: {
                object: "checkout.session",
                id: overrides.sessionId ?? "cs_test_1",
                payment_status: overrides.paymentStatus ?? "paid",
                status: overrides.status ?? "complete",
                client_reference_id: overrides.bookingId ?? "booking-1",
                payment_intent: overrides.paymentIntentId ?? "pi_test_1",
                metadata: {
                    bookingId: overrides.bookingId ?? "booking-1",
                },
            },
        },
    };
}

function createRefundEvent(type, overrides = {}) {
    const object =
        type === "charge.refunded"
            ? {
                  object: "charge",
                  id: overrides.chargeId ?? "ch_test_1",
                  refunded: overrides.refunded ?? true,
                  status: overrides.status ?? "succeeded",
                  payment_intent: overrides.paymentIntentId ?? "pi_test_1",
                  metadata: {
                      bookingId: overrides.bookingId ?? "booking-1",
                  },
              }
            : {
                  object: "refund",
                  id: overrides.refundId ?? "re_test_1",
                  status: overrides.status ?? "succeeded",
                  payment_intent: overrides.paymentIntentId ?? "pi_test_1",
                  metadata: {
                      bookingId: overrides.bookingId ?? "booking-1",
                  },
              };

    return {
        type,
        data: { object },
    };
}

function createTx(booking) {
    const state = { booking: { ...booking } };
    const calls = [];

    return {
        calls,
        state,
        booking: {
            findFirst: async ({ where }) => {
                calls.push(["booking.findFirst", where]);
                const matches = where.OR.some((condition) => {
                    if (condition.id) return state.booking.id === condition.id;
                    if (condition.stripeCheckoutSessionId) {
                        return state.booking.stripeCheckoutSessionId === condition.stripeCheckoutSessionId;
                    }
                    if (condition.stripePaymentIntentId) {
                        return state.booking.stripePaymentIntentId === condition.stripePaymentIntentId;
                    }
                    return false;
                });
                return matches ? { ...state.booking } : null;
            },
            updateMany: async ({ where, data }) => {
                calls.push(["booking.updateMany", { where, data }]);
                if (where.id !== state.booking.id || where.status !== state.booking.status) {
                    return { count: 0 };
                }
                state.booking = { ...state.booking, ...data };
                return { count: 1 };
            },
        },
        event: {
            updateMany: async (args) => {
                calls.push(["event.updateMany", args]);
                return { count: 1 };
            },
        },
        eventTicketType: {
            updateMany: async (args) => {
                calls.push(["eventTicketType.updateMany", args]);
                return { count: 1 };
            },
        },
    };
}

const baseBooking = {
    id: "booking-1",
    eventId: 12,
    quantity: 2,
    ticketTypeId: "ticket-type-1",
    status: "AWAITING_PAYMENT",
    stripeCheckoutSessionId: "cs_test_1",
    stripePaymentIntentId: null,
};

test("marks awaiting booking as paid from completed Stripe checkout session", async () => {
    const tx = createTx(baseBooking);

    const result = await processStripeWebhookEvent(
        tx,
        createSessionEvent("checkout.session.completed")
    );

    assert.equal(result.action, "paid");
    assert.equal(tx.state.booking.status, "PAID");
    assert.equal(tx.state.booking.paymentProvider, "STRIPE");
    assert.equal(tx.state.booking.stripeCheckoutSessionId, "cs_test_1");
    assert.equal(tx.state.booking.stripePaymentIntentId, "pi_test_1");
});

test("keeps SEPA checkout session pending until Stripe confirms async payment", async () => {
    const tx = createTx(baseBooking);

    const result = await processStripeWebhookEvent(
        tx,
        createSessionEvent("checkout.session.completed", {
            paymentStatus: "unpaid",
            status: "complete",
        })
    );

    assert.equal(result.action, "pending");
    assert.equal(tx.state.booking.status, "AWAITING_PAYMENT");
    assert.equal(tx.state.booking.paymentProvider, "STRIPE");
    assert.equal(tx.state.booking.stripePaymentIntentId, "pi_test_1");
    assert.equal(tx.state.booking.stripeStatus, "unpaid");
});

test("marks asynchronous Stripe checkout success as paid", async () => {
    const tx = createTx({
        ...baseBooking,
        stripePaymentIntentId: "pi_test_1",
    });

    const result = await processStripeWebhookEvent(
        tx,
        createSessionEvent("checkout.session.async_payment_succeeded")
    );

    assert.equal(result.action, "paid");
    assert.equal(tx.state.booking.status, "PAID");
});

test("fails asynchronous Stripe checkout failure and releases reservation", async () => {
    const tx = createTx({
        ...baseBooking,
        stripePaymentIntentId: "pi_test_1",
    });

    const result = await processStripeWebhookEvent(
        tx,
        createSessionEvent("checkout.session.async_payment_failed", {
            paymentStatus: "unpaid",
            status: "complete",
        })
    );

    assert.equal(result.action, "failed");
    assert.equal(tx.state.booking.status, "FAILED");
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
});

test("keeps Stripe payment intent processing as awaiting payment", async () => {
    const tx = createTx({
        ...baseBooking,
        stripePaymentIntentId: "pi_test_1",
    });

    const result = await processStripeWebhookEvent(tx, {
        type: "payment_intent.processing",
        data: {
            object: {
                object: "payment_intent",
                id: "pi_test_1",
                status: "processing",
                metadata: {
                    bookingId: "booking-1",
                },
            },
        },
    });

    assert.equal(result.action, "pending");
    assert.equal(tx.state.booking.status, "AWAITING_PAYMENT");
    assert.equal(tx.state.booking.stripeStatus, "processing");
});

test("fails awaiting booking and releases reservation from expired Stripe session", async () => {
    const tx = createTx(baseBooking);

    const result = await processStripeWebhookEvent(
        tx,
        createSessionEvent("checkout.session.expired", {
            paymentStatus: "unpaid",
            status: "expired",
        })
    );

    assert.equal(result.action, "failed");
    assert.equal(tx.state.booking.status, "FAILED");
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
    assert.ok(tx.calls.some(([name]) => name === "eventTicketType.updateMany"));
});

test("refunds paid booking and releases reservation from refunded Stripe charge", async () => {
    const tx = createTx({
        ...baseBooking,
        status: "PAID",
        stripePaymentIntentId: "pi_test_1",
    });

    const result = await processStripeWebhookEvent(
        tx,
        createRefundEvent("charge.refunded")
    );

    assert.equal(result.action, "refunded");
    assert.equal(tx.state.booking.status, "REFUNDED");
    assert.equal(tx.state.booking.paymentCancellationReason, "Stripe refund webhook");
    assert.equal(tx.state.booking.stripeStatus, "succeeded");
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
    assert.ok(tx.calls.some(([name]) => name === "eventTicketType.updateMany"));
});

test("refunds paid booking from succeeded Stripe refund update", async () => {
    const tx = createTx({
        ...baseBooking,
        status: "PAID",
        stripePaymentIntentId: "pi_test_1",
    });

    const result = await processStripeWebhookEvent(
        tx,
        createRefundEvent("refund.updated")
    );

    assert.equal(result.action, "refunded");
    assert.equal(tx.state.booking.status, "REFUNDED");
});

test("ignores Stripe refund updates that are not succeeded", async () => {
    const tx = createTx({
        ...baseBooking,
        status: "PAID",
        stripePaymentIntentId: "pi_test_1",
    });

    const result = await processStripeWebhookEvent(
        tx,
        createRefundEvent("refund.updated", { status: "pending" })
    );

    assert.deepEqual(result, {
        action: "ignored",
        reason: "refund-not-succeeded",
        eventType: "refund.updated",
    });
    assert.equal(tx.calls.length, 0);
});

test("ignores unsupported Stripe webhook events", async () => {
    const tx = createTx(baseBooking);

    const result = await processStripeWebhookEvent(
        tx,
        createSessionEvent("customer.created")
    );

    assert.deepEqual(result, {
        action: "ignored",
        reason: "unsupported-event-type",
        eventType: "customer.created",
    });
    assert.equal(tx.calls.length, 0);
});
