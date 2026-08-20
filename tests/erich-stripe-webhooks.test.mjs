import assert from "node:assert/strict";
import { test } from "node:test";

import { processStripeWebhookEvent } from "../src/lib/erich/stripe-webhooks.js";

const now = new Date("2026-09-01T10:30:00.000Z");

function createTx() {
    const calls = [];
    const state = {
        batch: {
            id: "batch-1",
            eventId: "event-1",
            accountId: "user-1",
            status: "CHECKOUT",
        },
        payment: {
            id: "payment-1",
            eventId: "event-1",
            registrationBatchId: "batch-1",
            accountId: "user-1",
            provider: "STRIPE",
            providerPaymentId: "cs_test_1",
            status: "CHECKOUT_ACTIVE",
        },
        attempt: {
            id: "attempt-1",
            paymentId: "payment-1",
            provider: "STRIPE",
            providerAttemptId: "cs_test_1",
            status: "CHECKOUT_ACTIVE",
            createdAt: now,
        },
        webhook: null,
    };

    return {
        calls,
        state,
        erichPayment: {
            findFirst: async (args) => {
                calls.push(["erichPayment.findFirst", args]);
                return {
                    ...state.payment,
                    attempts: [state.attempt],
                };
            },
            update: async (args) => {
                calls.push(["erichPayment.update", args]);
                state.payment = { ...state.payment, ...args.data };
                return state.payment;
            },
        },
        erichPaymentAttempt: {
            update: async (args) => {
                calls.push(["erichPaymentAttempt.update", args]);
                state.attempt = { ...state.attempt, ...args.data };
                return state.attempt;
            },
        },
        erichPaymentWebhook: {
            create: async (args) => {
                calls.push(["erichPaymentWebhook.create", args]);
                state.webhook = { id: "webhook-1", ...args.data };
                return state.webhook;
            },
            update: async (args) => {
                calls.push(["erichPaymentWebhook.update", args]);
                state.webhook = { ...state.webhook, ...args.data };
                return state.webhook;
            },
        },
        erichRegistrationBatch: {
            findUnique: async (args) => {
                calls.push(["erichRegistrationBatch.findUnique", args]);
                return state.batch;
            },
            updateMany: async (args) => {
                calls.push(["erichRegistrationBatch.updateMany", args]);
                if (state.batch.status !== args.where.status) return { count: 0 };
                state.batch = { ...state.batch, ...args.data };
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
}

test("ERICH Stripe webhook marks checkout batch as paid", async () => {
    const tx = createTx();
    const result = await processStripeWebhookEvent(
        tx,
        {
            id: "evt_1",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_test_1",
                    payment_intent: "pi_test_1",
                    metadata: {
                        paymentId: "payment-1",
                        registrationBatchId: "batch-1",
                    },
                },
            },
        },
        { now }
    );

    assert.equal(result.action, "paid");
    assert.equal(tx.state.batch.status, "PAID");
    assert.equal(tx.state.payment.status, "SUCCESSFUL");
    assert.equal(tx.state.attempt.status, "SUCCESSFUL");
    assert.equal(tx.state.webhook.processingResult, "paid");
    assert.equal(
        tx.calls.some(([name, args]) =>
            name === "erichAuditLog.create" &&
            args.data.action === "registration_batch.stripe_completed"
        ),
        true
    );
});

test("ERICH Stripe webhook ignores unsupported event types after recording them", async () => {
    const tx = createTx();
    const result = await processStripeWebhookEvent(
        tx,
        {
            id: "evt_ignored",
            type: "charge.refunded",
            data: { object: { id: "ch_1" } },
        },
        { now }
    );

    assert.equal(result.action, "ignored");
    assert.equal(result.reason, "unsupported-event");
    assert.equal(tx.state.webhook.processingResult, "ignored-charge.refunded");
    assert.equal(tx.state.batch.status, "CHECKOUT");
});
