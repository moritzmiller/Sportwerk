import assert from "node:assert/strict";
import test from "node:test";
import {
    extractPayPalWebhookIds,
    processPayPalWebhookEvent,
} from "../src/lib/paypal-webhooks.js";

function captureEvent(type, { orderId = "ORDER-1", captureId = "CAPTURE-1", status = "COMPLETED" } = {}) {
    return {
        event_type: type,
        resource: {
            id: captureId,
            status,
            supplementary_data: {
                related_ids: {
                    order_id: orderId,
                },
            },
        },
    };
}

function orderEvent(type, { orderId = "ORDER-1", captureId = "CAPTURE-1", status = "COMPLETED" } = {}) {
    return {
        event_type: type,
        resource: {
            id: orderId,
            status,
            purchase_units: [
                {
                    payments: {
                        captures: [{ id: captureId }],
                    },
                },
            ],
        },
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
                    if (condition.paypalOrderId) return state.booking.paypalOrderId === condition.paypalOrderId;
                    if (condition.paypalCaptureId) return state.booking.paypalCaptureId === condition.paypalCaptureId;
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
    paypalOrderId: "ORDER-1",
    paypalCaptureId: null,
};

test("extracts PayPal order and capture ids from capture events", () => {
    assert.deepEqual(extractPayPalWebhookIds(captureEvent("PAYMENT.CAPTURE.COMPLETED")), {
        orderId: "ORDER-1",
        captureId: "CAPTURE-1",
    });
});

test("extracts PayPal order and capture ids from checkout order events", () => {
    assert.deepEqual(extractPayPalWebhookIds(orderEvent("CHECKOUT.ORDER.COMPLETED")), {
        orderId: "ORDER-1",
        captureId: "CAPTURE-1",
    });
});

test("marks awaiting booking as paid from completed capture webhook", async () => {
    const tx = createTx(baseBooking);

    const result = await processPayPalWebhookEvent(
        tx,
        captureEvent("PAYMENT.CAPTURE.COMPLETED")
    );

    assert.equal(result.action, "paid");
    assert.equal(tx.state.booking.status, "PAID");
    assert.equal(tx.state.booking.paypalCaptureId, "CAPTURE-1");
    assert.equal(tx.state.booking.paypalStatus, "COMPLETED");
});

test("marks awaiting booking as paid from completed checkout order webhook", async () => {
    const tx = createTx(baseBooking);

    const result = await processPayPalWebhookEvent(
        tx,
        orderEvent("CHECKOUT.ORDER.COMPLETED")
    );

    assert.equal(result.action, "paid");
    assert.equal(tx.state.booking.status, "PAID");
    assert.equal(tx.state.booking.paypalOrderId, "ORDER-1");
    assert.equal(tx.state.booking.paypalCaptureId, "CAPTURE-1");
});

test("ignores webhook events without an event type", async () => {
    const tx = createTx(baseBooking);

    const result = await processPayPalWebhookEvent(tx, { resource: {} });

    assert.deepEqual(result, { action: "ignored", reason: "missing-event-type" });
    assert.equal(tx.calls.length, 0);
});

test("ignores unsupported webhook event types before querying bookings", async () => {
    const tx = createTx(baseBooking);

    const result = await processPayPalWebhookEvent(
        tx,
        captureEvent("BILLING.SUBSCRIPTION.CREATED")
    );

    assert.deepEqual(result, {
        action: "ignored",
        reason: "unsupported-event-type",
        eventType: "BILLING.SUBSCRIPTION.CREATED",
    });
    assert.equal(tx.calls.length, 0);
});

test("ignores supported webhook events when no booking can be matched", async () => {
    const tx = createTx({
        ...baseBooking,
        paypalOrderId: "OTHER-ORDER",
        paypalCaptureId: "OTHER-CAPTURE",
    });

    const result = await processPayPalWebhookEvent(
        tx,
        captureEvent("PAYMENT.CAPTURE.COMPLETED")
    );

    assert.deepEqual(result, {
        action: "ignored",
        reason: "booking-not-found",
        eventType: "PAYMENT.CAPTURE.COMPLETED",
    });
    assert.equal(tx.calls.some(([name]) => name === "booking.updateMany"), false);
});

test("ignores duplicate completed capture webhook for already paid booking", async () => {
    const tx = createTx({
        ...baseBooking,
        status: "PAID",
        paypalCaptureId: "CAPTURE-1",
    });

    const result = await processPayPalWebhookEvent(
        tx,
        captureEvent("PAYMENT.CAPTURE.COMPLETED")
    );

    assert.equal(result.action, "ignored");
    assert.equal(result.reason, "already-paid");
    assert.equal(tx.calls.some(([name]) => name === "booking.updateMany"), false);
});

test("fails awaiting booking and releases reservation from denied capture webhook", async () => {
    const tx = createTx(baseBooking);

    const result = await processPayPalWebhookEvent(
        tx,
        captureEvent("PAYMENT.CAPTURE.DENIED", { status: "DENIED" })
    );

    assert.equal(result.action, "failed");
    assert.equal(tx.state.booking.status, "FAILED");
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
    assert.ok(tx.calls.some(([name]) => name === "eventTicketType.updateMany"));
});

test("refunds paid booking and releases reservation from refunded capture webhook", async () => {
    const tx = createTx({
        ...baseBooking,
        status: "PAID",
        paypalCaptureId: "CAPTURE-1",
    });

    const result = await processPayPalWebhookEvent(
        tx,
        captureEvent("PAYMENT.CAPTURE.REFUNDED", { status: "REFUNDED" })
    );

    assert.equal(result.action, "refunded");
    assert.equal(tx.state.booking.status, "REFUNDED");
    assert.equal(tx.state.booking.paymentCancellationReason, "PayPal refund webhook");
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
    assert.ok(tx.calls.some(([name]) => name === "eventTicketType.updateMany"));
});
