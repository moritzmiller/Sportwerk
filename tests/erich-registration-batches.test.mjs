import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildRegistrationChargeSummary,
    createTemporaryRegistrationBatchData,
    assertRegistrationBatchCanBeEdited,
    isAsyncPaymentPendingExpired,
    isCheckoutExpired,
    isRegistrationBatchExpired,
    markRegistrationBatchCheckout,
    expireCheckoutBatch,
    markRegistrationBatchInvalid,
    markRegistrationBatchPaid,
    prepareExpiredCheckoutInvalidation,
    prepareCheckoutTransition,
    prepareInitialPaymentAttemptData,
    prepareInitialPaymentData,
} from "../src/lib/erich/registration-batches.js";

const now = new Date("2026-09-01T10:00:00.000Z");

test("ERICH temporary registration batches expire after 15 minutes by default", () => {
    const data = createTemporaryRegistrationBatchData({
        eventId: "event-1",
        accountId: "user-1",
        now,
    });

    assert.equal(data.status, "TEMPORARY");
    assert.equal(data.expiresAt.toISOString(), "2026-09-01T10:15:00.000Z");
    assert.equal(isRegistrationBatchExpired(data, new Date("2026-09-01T10:14:59.999Z")), false);
    assert.equal(isRegistrationBatchExpired(data, new Date("2026-09-01T10:15:00.000Z")), true);
});

test("ERICH registration charge summary totals race entries, team entries and payment fee in cents", () => {
    const summary = buildRegistrationChargeSummary({
        raceEntries: [
            { status: "ACTIVE", priceCents: 4000 },
            { status: "CANCELLED", priceCents: 4000 },
        ],
        teamEntries: [
            { status: "ACTIVE", priceCents: 6000 },
            { status: "TEMPORARY", priceCents: 12000 },
            { status: "CANCELLED", priceCents: 6000 },
        ],
        paymentFeeCents: 175,
    });

    assert.deepEqual(summary, {
        raceEntryCount: 1,
        teamEntryCount: 2,
        raceEntryCents: 4000,
        teamEntryCents: 18000,
        paymentFeeCents: 175,
        totalCents: 22175,
        currency: "EUR",
    });
});

test("ERICH checkout transition is only possible for non-expired billable temporary batches", () => {
    const batch = {
        id: "batch-1",
        status: "TEMPORARY",
        expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    };
    const summary = buildRegistrationChargeSummary({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000 }],
    });

    const transition = prepareCheckoutTransition({
        batch,
        summary,
        now,
    });

    assert.equal(transition.status, "CHECKOUT");
    assert.equal(transition.submittedAt, now);
    assert.equal(transition.checkoutExpiresAt.toISOString(), "2026-09-01T10:20:00.000Z");
    assert.equal(isCheckoutExpired(transition, new Date("2026-09-01T10:20:00.000Z")), true);

    assert.throws(
        () =>
            prepareCheckoutTransition({
                batch: { ...batch, status: "PAID" },
                summary,
                now,
            }),
        /cannot start checkout/
    );

    assert.throws(
        () =>
            prepareCheckoutTransition({
                batch,
                summary,
                now: new Date("2026-09-01T10:15:00.000Z"),
            }),
        (error) => {
            assert.equal(error.code, "ERICH_REGISTRATION_DRAFT_EXPIRED");
            return true;
        }
    );

    assert.throws(
        () =>
            prepareCheckoutTransition({
                batch,
                summary: buildRegistrationChargeSummary(),
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_REGISTRATION_EMPTY");
            return true;
        }
    );
});

test("ERICH registration batches can only be edited while temporary and not expired", () => {
    const batch = {
        id: "batch-1",
        status: "TEMPORARY",
        expiresAt: new Date("2026-09-01T10:15:00.000Z"),
    };

    assert.equal(assertRegistrationBatchCanBeEdited({ batch, now }), true);

    assert.throws(
        () => assertRegistrationBatchCanBeEdited({ batch: { ...batch, status: "CHECKOUT" }, now }),
        (error) => {
            assert.equal(error.code, "ERICH_REGISTRATION_NOT_EDITABLE");
            return true;
        }
    );

    assert.throws(
        () =>
            assertRegistrationBatchCanBeEdited({
                batch,
                now: new Date("2026-09-01T10:15:00.000Z"),
            }),
        (error) => {
            assert.equal(error.code, "ERICH_REGISTRATION_DRAFT_EXPIRED");
            return true;
        }
    );
});

test("ERICH initial payment data is provider-neutral and cent-based", () => {
    const summary = buildRegistrationChargeSummary({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000 }],
        paymentFeeCents: 125,
    });

    assert.deepEqual(
        prepareInitialPaymentData({
            eventId: "event-1",
            registrationBatchId: "batch-1",
            accountId: "user-1",
            provider: "SANDBOX",
            summary,
        }),
        {
            eventId: "event-1",
            registrationBatchId: "batch-1",
            accountId: "user-1",
            provider: "SANDBOX",
            amountCents: 4125,
            feeCents: 125,
            currency: "EUR",
            status: "CHECKOUT_ACTIVE",
        }
    );
});

test("ERICH initial payment attempt data captures checkout provider metadata", () => {
    const summary = buildRegistrationChargeSummary({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000 }],
        paymentFeeCents: 125,
    });
    const expiresAt = new Date("2026-09-01T10:20:00.000Z");

    assert.deepEqual(
        prepareInitialPaymentAttemptData({
            paymentId: "payment-1",
            provider: "SIMULATED",
            providerAttemptId: "simulated-payment-1",
            summary,
            checkoutExpiresAt: expiresAt,
            checkoutUrl: "https://checkout.example.test/pay",
            providerPayload: { mode: "SIMULATED" },
        }),
        {
            paymentId: "payment-1",
            provider: "SIMULATED",
            providerAttemptId: "simulated-payment-1",
            paymentMethod: "SIMULATED",
            status: "CHECKOUT_ACTIVE",
            amountCents: 4125,
            feeCents: 125,
            currency: "EUR",
            checkoutUrl: "https://checkout.example.test/pay",
            expiresAt,
            providerPayload: { mode: "SIMULATED" },
        }
    );
});

test("ERICH async pending payment attempts expire after 24 hours", () => {
    const attempt = {
        status: "PENDING",
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
    };

    assert.equal(isAsyncPaymentPendingExpired(attempt, new Date("2026-09-02T09:59:59.999Z")), false);
    assert.equal(isAsyncPaymentPendingExpired(attempt, new Date("2026-09-02T10:00:00.000Z")), true);
    assert.equal(isAsyncPaymentPendingExpired({ ...attempt, status: "SUCCESSFUL" }, new Date("2026-09-03T10:00:00.000Z")), false);
});

test("ERICH registration batch checkout transition uses idempotent updateMany", async () => {
    const calls = [];
    const tx = {
        erichRegistrationBatch: {
            updateMany: async (args) => {
                calls.push(args);
                return { count: 1 };
            },
        },
    };

    const data = { status: "CHECKOUT", submittedAt: now, checkoutExpiresAt: new Date(now.getTime() + 1) };
    const result = await markRegistrationBatchCheckout(tx, { id: "batch-1", status: "TEMPORARY" }, data);

    assert.deepEqual(result, {
        action: "checkout",
        reason: null,
        registrationBatchId: "batch-1",
    });
    assert.deepEqual(calls[0], {
        where: { id: "batch-1", status: "TEMPORARY" },
        data,
    });
});

test("ERICH registration batch payment and invalidation transitions are status-guarded", async () => {
    const updates = [];
    const tx = {
        erichRegistrationBatch: {
            updateMany: async (args) => {
                updates.push(args);
                return { count: 1 };
            },
        },
    };

    const paidAt = new Date("2026-09-01T10:05:00.000Z");
    const paid = await markRegistrationBatchPaid(
        tx,
        { id: "batch-1", status: "CHECKOUT" },
        { paidAt }
    );

    assert.equal(paid.action, "paid");
    assert.deepEqual(updates[0], {
        where: { id: "batch-1", status: "CHECKOUT" },
        data: { paidAt, status: "PAID" },
    });

    const ignored = await markRegistrationBatchPaid(tx, { id: "batch-1", status: "TEMPORARY" });
    assert.deepEqual(ignored, {
        action: "ignored",
        reason: "status-TEMPORARY",
        registrationBatchId: "batch-1",
    });

    const invalidatedAt = new Date("2026-09-01T10:21:00.000Z");
    const invalidated = await markRegistrationBatchInvalid(
        tx,
        { id: "batch-2", status: "CHECKOUT" },
        { invalidatedAt }
    );

    assert.equal(invalidated.action, "invalidated");
    assert.deepEqual(updates[1], {
        where: { id: "batch-2", status: "CHECKOUT" },
        data: { invalidatedAt, status: "INVALID" },
    });
});

test("ERICH expired checkout invalidation only targets expired checkout batches", () => {
    const activeCheckout = {
        id: "batch-1",
        status: "CHECKOUT",
        checkoutExpiresAt: new Date("2026-09-01T10:20:01.000Z"),
    };
    const expiredCheckout = {
        ...activeCheckout,
        checkoutExpiresAt: new Date("2026-09-01T10:20:00.000Z"),
    };

    assert.deepEqual(prepareExpiredCheckoutInvalidation({ batch: activeCheckout, now: new Date("2026-09-01T10:20:00.000Z") }), {
        action: "ignored",
        reason: "checkout-active",
        registrationBatchId: "batch-1",
        batchData: null,
        paymentWhere: null,
        paymentData: null,
    });

    const transition = prepareExpiredCheckoutInvalidation({
        batch: expiredCheckout,
        now: new Date("2026-09-01T10:20:00.000Z"),
    });
    assert.equal(transition.action, "expire-checkout");
    assert.deepEqual(transition.batchData, {
        status: "INVALID",
        invalidatedAt: new Date("2026-09-01T10:20:00.000Z"),
    });
    assert.deepEqual(transition.paymentWhere, {
        registrationBatchId: "batch-1",
        status: { in: ["OPEN", "CHECKOUT_ACTIVE"] },
    });
    assert.deepEqual(transition.paymentData, { status: "EXPIRED" });
});

test("ERICH checkout expiry invalidates batch and open checkout payments idempotently", async () => {
    const calls = [];
    const tx = {
        erichRegistrationBatch: {
            updateMany: async (args) => {
                calls.push(["erichRegistrationBatch.updateMany", args]);
                return { count: 1 };
            },
        },
        erichPayment: {
            updateMany: async (args) => {
                calls.push(["erichPayment.updateMany", args]);
                return { count: 1 };
            },
        },
    };

    const result = await expireCheckoutBatch(
        tx,
        {
            id: "batch-1",
            status: "CHECKOUT",
            checkoutExpiresAt: new Date("2026-09-01T10:20:00.000Z"),
        },
        { now: new Date("2026-09-01T10:21:00.000Z") }
    );

    assert.deepEqual(result, {
        action: "expired-checkout",
        reason: null,
        registrationBatchId: "batch-1",
        expiredPaymentCount: 1,
    });
    assert.deepEqual(calls.map(([name]) => name), [
        "erichRegistrationBatch.updateMany",
        "erichPayment.updateMany",
    ]);
});
