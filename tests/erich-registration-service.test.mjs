import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertCanAccessRegistrationBatch,
    buildRegistrationBatchSummary,
    captureRegistrationPayPalCheckout,
    captureRegistrationStripeCheckout,
    createOrReuseTemporaryRegistrationBatch,
    listRegistrationBatches,
    startRegistrationCheckout,
} from "../src/lib/erich/registration-service.js";

const now = new Date("2026-09-01T10:00:00.000Z");
const user = { id: "user-1", role: "VISITOR", erichRoleAssignments: [] };
const officeUser = {
    id: "office-1",
    role: "VISITOR",
    erichRoleAssignments: [{ eventId: "event-1", role: "REGISTRATION_OFFICE" }],
};

function batch(overrides = {}) {
    return {
        id: "batch-1",
        eventId: "event-1",
        accountId: "user-1",
        status: "TEMPORARY",
        expiresAt: new Date("2026-09-01T10:15:00.000Z"),
        raceEntries: [],
        teamEntries: [],
        payments: [],
        createdAt: now,
        ...overrides,
    };
}

function createStore({
    event = { id: "event-1", status: "ACTIVE" },
    existingBatch = null,
    batches = [],
} = {}) {
    const calls = [];
    const state = {
        batch: existingBatch ?? batch(),
        payment: null,
        paymentAttempt: null,
    };

    const store = {
        calls,
        state,
        erichEvent: {
            findUnique: async (args) => {
                calls.push(["erichEvent.findUnique", args]);
                return event;
            },
        },
        erichRegistrationBatch: {
            findMany: async (args) => {
                calls.push(["erichRegistrationBatch.findMany", args]);
                return batches;
            },
            findFirst: async (args) => {
                calls.push(["erichRegistrationBatch.findFirst", args]);
                return existingBatch;
            },
            findUnique: async (args) => {
                calls.push(["erichRegistrationBatch.findUnique", args]);
                return state.batch;
            },
            create: async (args) => {
                calls.push(["erichRegistrationBatch.create", args]);
                state.batch = batch({
                    ...args.data,
                    id: "batch-created",
                    raceEntries: [],
                    teamEntries: [],
                    payments: [],
                });
                return state.batch;
            },
            updateMany: async (args) => {
                calls.push(["erichRegistrationBatch.updateMany", args]);
                if (state.batch.status !== args.where.status) return { count: 0 };
                state.batch = {
                    ...state.batch,
                    ...args.data,
                };
                return { count: 1 };
            },
        },
        erichPayment: {
            findFirst: async (args) => {
                calls.push(["erichPayment.findFirst", args]);
                return state.payment
                    ? {
                          ...state.payment,
                          attempts: state.paymentAttempt ? [state.paymentAttempt] : [],
                      }
                    : null;
            },
            create: async (args) => {
                calls.push(["erichPayment.create", args]);
                state.payment = { id: "payment-1", ...args.data };
                state.batch = {
                    ...state.batch,
                    payments: [state.payment],
                };
                return state.payment;
            },
            update: async (args) => {
                calls.push(["erichPayment.update", args]);
                state.payment = { ...state.payment, ...args.data };
                return state.payment;
            },
            updateMany: async (args) => {
                calls.push(["erichPayment.updateMany", args]);
                return { count: 1 };
            },
        },
        erichPaymentAttempt: {
            create: async (args) => {
                calls.push(["erichPaymentAttempt.create", args]);
                state.paymentAttempt = { id: "payment-attempt-1", ...args.data };
                return state.paymentAttempt;
            },
            update: async (args) => {
                calls.push(["erichPaymentAttempt.update", args]);
                state.paymentAttempt = { ...state.paymentAttempt, ...args.data };
                return state.paymentAttempt;
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
        $transaction: async (callback) => callback(store),
    };

    return store;
}

test("ERICH registration service summarizes billable draft entries", () => {
    const summary = buildRegistrationBatchSummary(
        batch({
            raceEntries: [
                { status: "ACTIVE", priceCents: 4000 },
                { status: "CANCELLED", priceCents: 4000 },
            ],
            teamEntries: [{ status: "TEMPORARY", priceCents: 6000 }],
        })
    );

    assert.deepEqual(summary, {
        raceEntryCount: 1,
        teamEntryCount: 1,
        raceEntryCents: 4000,
        teamEntryCents: 6000,
        paymentFeeCents: 0,
        totalCents: 10000,
        currency: "EUR",
    });
});

test("ERICH registration service creates a temporary batch and audit entry", async () => {
    const store = createStore({ existingBatch: null });

    const result = await createOrReuseTemporaryRegistrationBatch(store, {
        user,
        eventId: "event-1",
        now,
    });

    assert.equal(result.reused, false);
    assert.equal(result.batch.id, "batch-created");
    assert.equal(result.batch.status, "TEMPORARY");
    assert.equal(result.batch.expiresAt.toISOString(), "2026-09-01T10:15:00.000Z");
    assert.equal(result.batch.summary.totalCents, 0);
    assert.deepEqual(
        store.calls.map(([name]) => name),
        [
            "erichEvent.findUnique",
            "erichRegistrationBatch.findFirst",
            "erichRegistrationBatch.findFirst",
            "erichRegistrationBatch.create",
            "erichAuditLog.create",
        ]
    );
});

test("ERICH registration service reuses a non-expired temporary batch", async () => {
    const existing = batch({ id: "batch-existing" });
    const store = createStore({ existingBatch: existing });

    const result = await createOrReuseTemporaryRegistrationBatch(store, {
        user,
        eventId: "event-1",
        now,
    });

    assert.equal(result.reused, true);
    assert.equal(result.batch.id, "batch-existing");
    assert.equal(store.calls.some(([name]) => name === "erichRegistrationBatch.create"), false);
    assert.equal(store.calls.some(([name]) => name === "erichAuditLog.create"), false);
});

test("ERICH registration service refuses inactive or missing events", async () => {
    await assert.rejects(
        () =>
            createOrReuseTemporaryRegistrationBatch(createStore({ event: null }), {
                user,
                eventId: "event-1",
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_EVENT_NOT_FOUND");
            return true;
        }
    );

    await assert.rejects(
        () =>
            createOrReuseTemporaryRegistrationBatch(
                createStore({ event: { id: "event-1", status: "DRAFT" } }),
                {
                    user,
                    eventId: "event-1",
                    now,
                }
            ),
        (error) => {
            assert.equal(error.code, "ERICH_EVENT_NOT_REGISTERABLE");
            return true;
        }
    );
});

test("ERICH registration service hides inaccessible batches as not found", () => {
    assert.equal(assertCanAccessRegistrationBatch({ user, batch: batch({ accountId: "user-1" }) }), true);

    assert.throws(
        () => assertCanAccessRegistrationBatch({ user, batch: batch({ accountId: "other-user" }) }),
        (error) => {
            assert.equal(error.code, "ERICH_REGISTRATION_BATCH_NOT_FOUND");
            return true;
        }
    );

    assert.equal(
        assertCanAccessRegistrationBatch({
            user: officeUser,
            batch: batch({ accountId: "other-user" }),
        }),
        true
    );
});

test("ERICH registration service lists batches using scoped access", async () => {
    const visibleBatch = batch({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000 }],
    });
    const store = createStore({ batches: [visibleBatch] });

    const result = await listRegistrationBatches(store, { user, eventId: "event-1" });

    assert.equal(result.length, 1);
    assert.equal(result[0].summary.totalCents, 4000);
    assert.deepEqual(store.calls[0][1].where, {
        accountId: "user-1",
        eventId: "event-1",
    });
});

test("ERICH registration service starts manual bank-transfer checkout and payment", async () => {
    const oldIban = process.env.BANK_TRANSFER_IBAN;
    const oldBic = process.env.BANK_TRANSFER_BIC;
    const oldHolder = process.env.BANK_TRANSFER_ACCOUNT_HOLDER;
    process.env.BANK_TRANSFER_IBAN = "DE89370400440532013000";
    process.env.BANK_TRANSFER_BIC = "COBADEFFXXX";
    process.env.BANK_TRANSFER_ACCOUNT_HOLDER = "GateKeeper";
    const store = createStore();
    store.state.batch = batch({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000 }],
    });

    try {
        const result = await startRegistrationCheckout(store, {
            user,
            batchId: "batch-1",
            now,
        });

        assert.equal(result.batch.status, "CHECKOUT");
        assert.equal(result.batch.summary.totalCents, 4000);
        assert.equal(result.payment.provider, "BANK_TRANSFER");
        assert.equal(result.payment.amountCents, 4000);
        assert.equal(result.payment.status, "PENDING");
        assert.equal(result.paymentAttempt.provider, "BANK_TRANSFER");
        assert.equal(result.paymentAttempt.status, "PENDING");
        assert.equal(result.paymentAttempt.expiresAt.toISOString(), "2026-09-15T10:00:00.000Z");
        assert.deepEqual(result.checkout, {
            provider: "BANK_TRANSFER",
            paymentId: "payment-1",
            paymentAttemptId: "payment-attempt-1",
            checkoutUrl: null,
            expiresAt: new Date("2026-09-15T10:00:00.000Z"),
            requiresRedirect: false,
            status: "PENDING",
            manualPayment: {
                paymentMethod: "BANK_TRANSFER",
                paymentMethodLabel: "Bankueberweisung",
                paymentReference: "ERICH-PAYMENT1",
                dueDate: "2026-09-15T10:00:00.000Z",
                iban: "DE89370400440532013000",
                bic: "COBADEFFXXX",
                accountHolder: "GateKeeper",
            },
        });
        assert.deepEqual(
            store.calls.map(([name]) => name),
            [
                "erichRegistrationBatch.findUnique",
                "erichRegistrationBatch.updateMany",
                "erichPayment.create",
                "erichPaymentAttempt.create",
                "erichAuditLog.create",
                "erichRegistrationBatch.findUnique",
            ]
        );
    } finally {
        if (oldIban === undefined) delete process.env.BANK_TRANSFER_IBAN;
        else process.env.BANK_TRANSFER_IBAN = oldIban;
        if (oldBic === undefined) delete process.env.BANK_TRANSFER_BIC;
        else process.env.BANK_TRANSFER_BIC = oldBic;
        if (oldHolder === undefined) delete process.env.BANK_TRANSFER_ACCOUNT_HOLDER;
        else process.env.BANK_TRANSFER_ACCOUNT_HOLDER = oldHolder;
    }
});

test("ERICH registration service starts PayPal checkout with redirect order", async () => {
    const store = createStore();
    store.state.batch = batch({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000, currency: "EUR" }],
    });
    const paypalCalls = [];
    const paypal = {
        isConfigured: () => true,
        createOrder: async (args) => {
            paypalCalls.push(args);
            return {
                orderId: "PAYPAL-ORDER-1",
                approvalUrl: "https://paypal.example/checkout/PAYPAL-ORDER-1",
                raw: { id: "PAYPAL-ORDER-1", status: "CREATED" },
            };
        },
    };

    const result = await startRegistrationCheckout(store, {
        user,
        batchId: "batch-1",
        provider: "PAYPAL",
        origin: "https://gatekeeper.example",
        paypal,
        now,
    });

    assert.equal(result.payment.provider, "PAYPAL");
    assert.equal(result.payment.providerPaymentId, "PAYPAL-ORDER-1");
    assert.equal(result.paymentAttempt.providerAttemptId, "PAYPAL-ORDER-1");
    assert.equal(result.paymentAttempt.checkoutUrl, "https://paypal.example/checkout/PAYPAL-ORDER-1");
    assert.equal(result.checkout.requiresRedirect, true);
    assert.equal(result.checkout.checkoutUrl, "https://paypal.example/checkout/PAYPAL-ORDER-1");
    assert.equal(result.checkout.providerOrderId, "PAYPAL-ORDER-1");
    assert.equal(paypalCalls[0].amountCents, 4000);
    assert.equal(paypalCalls[0].currency, "EUR");
    assert.match(paypalCalls[0].returnUrl, /^https:\/\/gatekeeper\.example\/erich\/register/);
    assert.equal(
        store.calls.some(([name, args]) =>
            name === "erichPaymentAttempt.update" &&
            args.data.checkoutUrl === "https://paypal.example/checkout/PAYPAL-ORDER-1"
        ),
        true
    );
});

test("ERICH registration service starts Stripe checkout with redirect session", async () => {
    const store = createStore();
    store.state.batch = batch({
        raceEntries: [{ status: "ACTIVE", priceCents: 4000, currency: "EUR" }],
    });
    const stripeCalls = [];
    const stripe = {
        isConfigured: () => true,
        createCheckoutSession: async (args) => {
            stripeCalls.push(args);
            return {
                sessionId: "cs_test_1",
                checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
                paymentIntentId: "pi_test_1",
                raw: { id: "cs_test_1", payment_status: "unpaid" },
            };
        },
    };

    const result = await startRegistrationCheckout(store, {
        user,
        batchId: "batch-1",
        provider: "STRIPE",
        origin: "https://gatekeeper.example",
        stripe,
        now,
    });

    assert.equal(result.payment.provider, "STRIPE");
    assert.equal(result.payment.providerPaymentId, "cs_test_1");
    assert.equal(result.paymentAttempt.providerAttemptId, "cs_test_1");
    assert.equal(result.paymentAttempt.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_1");
    assert.equal(result.checkout.requiresRedirect, true);
    assert.equal(result.checkout.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_1");
    assert.equal(result.checkout.providerSessionId, "cs_test_1");
    assert.equal(stripeCalls[0].amountCents, 4000);
    assert.equal(stripeCalls[0].currency, "EUR");
    assert.match(stripeCalls[0].returnUrl, /^https:\/\/gatekeeper\.example\/erich\/register/);
    assert.equal(
        store.calls.some(([name, args]) =>
            name === "erichPaymentAttempt.update" &&
            args.data.checkoutUrl === "https://checkout.stripe.com/c/pay/cs_test_1"
        ),
        true
    );
});

test("ERICH registration service captures PayPal checkout and marks batch paid", async () => {
    const store = createStore();
    store.state.batch = batch({
        status: "CHECKOUT",
        checkoutExpiresAt: new Date("2026-09-01T10:20:00.000Z"),
        raceEntries: [{ status: "ACTIVE", priceCents: 4000, currency: "EUR" }],
    });
    store.state.payment = {
        id: "payment-1",
        eventId: "event-1",
        registrationBatchId: "batch-1",
        accountId: "user-1",
        provider: "PAYPAL",
        providerPaymentId: "PAYPAL-ORDER-1",
        amountCents: 4000,
        feeCents: 0,
        currency: "EUR",
        status: "CHECKOUT_ACTIVE",
    };
    store.state.paymentAttempt = {
        id: "payment-attempt-1",
        paymentId: "payment-1",
        provider: "PAYPAL",
        providerAttemptId: "PAYPAL-ORDER-1",
        status: "CHECKOUT_ACTIVE",
        amountCents: 4000,
        feeCents: 0,
        currency: "EUR",
        checkoutUrl: "https://paypal.example/checkout/PAYPAL-ORDER-1",
        createdAt: now,
    };
    const paypal = {
        captureOrder: async (orderId) => ({
            id: orderId,
            status: "COMPLETED",
            purchase_units: [
                {
                    payments: {
                        captures: [{ id: "PAYPAL-CAPTURE-1" }],
                    },
                },
            ],
        }),
    };

    const result = await captureRegistrationPayPalCheckout(store, {
        user,
        batchId: "batch-1",
        orderId: "PAYPAL-ORDER-1",
        paypal,
        now,
    });

    assert.equal(result.batch.status, "PAID");
    assert.equal(result.payment.status, "SUCCESSFUL");
    assert.equal(result.paymentAttempt.status, "SUCCESSFUL");
    assert.equal(result.paymentAttempt.providerPayload.captureId, "PAYPAL-CAPTURE-1");
    assert.equal(
        store.calls.some(([name, args]) =>
            name === "erichAuditLog.create" &&
            args.data.action === "registration_batch.paypal_captured"
        ),
        true
    );
});

test("ERICH registration service captures Stripe checkout and marks batch paid", async () => {
    const store = createStore();
    store.state.batch = batch({
        status: "CHECKOUT",
        checkoutExpiresAt: new Date("2026-09-01T10:20:00.000Z"),
        raceEntries: [{ status: "ACTIVE", priceCents: 4000, currency: "EUR" }],
    });
    store.state.payment = {
        id: "payment-1",
        eventId: "event-1",
        registrationBatchId: "batch-1",
        accountId: "user-1",
        provider: "STRIPE",
        providerPaymentId: "cs_test_1",
        amountCents: 4000,
        feeCents: 0,
        currency: "EUR",
        status: "CHECKOUT_ACTIVE",
    };
    store.state.paymentAttempt = {
        id: "payment-attempt-1",
        paymentId: "payment-1",
        provider: "STRIPE",
        providerAttemptId: "cs_test_1",
        status: "CHECKOUT_ACTIVE",
        amountCents: 4000,
        feeCents: 0,
        currency: "EUR",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
        createdAt: now,
    };
    const stripe = {
        retrieveCheckoutSession: async (sessionId) => ({
            sessionId,
            paymentStatus: "paid",
            status: "complete",
            paymentIntentId: "pi_test_1",
            raw: {
                id: sessionId,
                payment_status: "paid",
                status: "complete",
                payment_intent: "pi_test_1",
            },
        }),
    };

    const result = await captureRegistrationStripeCheckout(store, {
        user,
        batchId: "batch-1",
        sessionId: "cs_test_1",
        stripe,
        now,
    });

    assert.equal(result.batch.status, "PAID");
    assert.equal(result.payment.status, "SUCCESSFUL");
    assert.equal(result.paymentAttempt.status, "SUCCESSFUL");
    assert.equal(result.paymentAttempt.providerPayload.checkoutSessionId, "cs_test_1");
    assert.equal(result.paymentAttempt.providerPayload.paymentIntentId, "pi_test_1");
    assert.equal(
        store.calls.some(([name, args]) =>
            name === "erichAuditLog.create" &&
            args.data.action === "registration_batch.stripe_captured"
        ),
        true
    );
});

test("ERICH registration service refuses incomplete Stripe return payments", async () => {
    const store = createStore();
    store.state.batch = batch({
        status: "CHECKOUT",
        checkoutExpiresAt: new Date("2026-09-01T10:20:00.000Z"),
        raceEntries: [{ status: "ACTIVE", priceCents: 4000, currency: "EUR" }],
    });
    store.state.payment = {
        id: "payment-1",
        eventId: "event-1",
        registrationBatchId: "batch-1",
        accountId: "user-1",
        provider: "STRIPE",
        providerPaymentId: "cs_test_1",
        amountCents: 4000,
        feeCents: 0,
        currency: "EUR",
        status: "CHECKOUT_ACTIVE",
    };
    store.state.paymentAttempt = {
        id: "payment-attempt-1",
        paymentId: "payment-1",
        provider: "STRIPE",
        providerAttemptId: "cs_test_1",
        status: "CHECKOUT_ACTIVE",
        amountCents: 4000,
        feeCents: 0,
        currency: "EUR",
        createdAt: now,
    };

    await assert.rejects(
        () =>
            captureRegistrationStripeCheckout(store, {
                user,
                batchId: "batch-1",
                sessionId: "cs_test_1",
                stripe: {
                    retrieveCheckoutSession: async (sessionId) => ({
                        sessionId,
                        paymentStatus: "unpaid",
                        status: "open",
                        paymentIntentId: null,
                        raw: { id: sessionId, payment_status: "unpaid" },
                    }),
                },
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_STRIPE_PAYMENT_NOT_COMPLETED");
            return true;
        }
    );
});

test("ERICH registration service invalidates expired checkout before creating a new draft", async () => {
    const expiredCheckout = batch({
        id: "checkout-expired",
        status: "CHECKOUT",
        checkoutExpiresAt: new Date("2026-09-01T09:59:00.000Z"),
    });
    let findFirstCount = 0;
    const store = createStore({ existingBatch: null });
    store.state.batch = expiredCheckout;
    store.erichRegistrationBatch.findFirst = async (args) => {
        store.calls.push(["erichRegistrationBatch.findFirst", args]);
        findFirstCount += 1;
        return findFirstCount === 1 ? expiredCheckout : null;
    };

    const result = await createOrReuseTemporaryRegistrationBatch(store, {
        user,
        eventId: "event-1",
        now,
    });

    assert.equal(result.reused, false);
    assert.equal(result.batch.id, "batch-created");
    assert.equal(
        store.calls.some(
            ([name, args]) =>
                name === "erichRegistrationBatch.updateMany" &&
                args.where.id === "checkout-expired" &&
                args.data.status === "INVALID"
        ),
        true
    );
    assert.equal(store.calls.some(([name]) => name === "erichPayment.updateMany"), true);
    assert.equal(
        store.calls.some(
            ([name, args]) =>
                name === "erichAuditLog.create" &&
                args.data.action === "registration_batch.checkout_expired"
        ),
        true
    );
});

test("ERICH registration service refuses empty or unsupported checkout", async () => {
    await assert.rejects(
        () =>
            startRegistrationCheckout(createStore(), {
                user,
                batchId: "batch-1",
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_REGISTRATION_EMPTY");
            return true;
        }
    );

    await assert.rejects(
        () =>
            startRegistrationCheckout(createStore(), {
                user,
                batchId: "batch-1",
                provider: "STRIPE",
                stripe: { isConfigured: () => false },
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_STRIPE_NOT_CONFIGURED");
            return true;
        }
    );

    await assert.rejects(
        () =>
            startRegistrationCheckout(createStore(), {
                user,
                batchId: "batch-1",
                provider: "PAYPAL",
                paypal: { isConfigured: () => false },
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_PAYPAL_NOT_CONFIGURED");
            return true;
        }
    );

    await assert.rejects(
        () =>
            startRegistrationCheckout(createStore(), {
                user,
                batchId: "batch-1",
                provider: "UNKNOWN",
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_PAYMENT_PROVIDER_UNSUPPORTED");
            return true;
        }
    );
});
