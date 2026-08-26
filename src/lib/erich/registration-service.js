import { writeErichAuditLog } from "./audit.js";
import { canManageOwnErichRecord, getErichRegistrationAccessWhere } from "./permissions.js";
import {
    buildRegistrationChargeSummary,
    createTemporaryRegistrationBatchData,
    ERICH_PAYMENT_STATUS,
    markRegistrationBatchPaid,
    expireCheckoutBatch,
    markRegistrationBatchCheckout,
    prepareInitialPaymentAttemptData,
    prepareCheckoutTransition,
    prepareInitialPaymentData,
} from "./registration-batches.js";
import { getManualPaymentDueDate } from "../manual-payments.js";
import { capturePayPalOrder, createPayPalOrder, isPayPalConfigured } from "../paypal.js";
import {
    createStripeCheckoutSession,
    isStripeConfigured,
    retrieveStripeCheckoutSession,
} from "../stripe.js";
import { syncUnifiedBookingFromErichBatch } from "./unified-migration.js";

export const ERICH_REGISTRATION_CHECKOUT_PROVIDERS = Object.freeze({
    BANK_TRANSFER: "BANK_TRANSFER",
    INVOICE: "INVOICE",
    PAYPAL: "PAYPAL",
    STRIPE: "STRIPE",
    SIMULATED: "SIMULATED",
});

const MANUAL_CHECKOUT_PROVIDERS = new Set([
    ERICH_REGISTRATION_CHECKOUT_PROVIDERS.BANK_TRANSFER,
    ERICH_REGISTRATION_CHECKOUT_PROVIDERS.INVOICE,
]);

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export function buildRegistrationBatchSummary(batch) {
    return buildRegistrationChargeSummary({
        raceEntries: batch?.raceEntries ?? [],
        teamEntries: batch?.teamEntries ?? [],
    });
}

export function assertCanAccessRegistrationBatch({ user, batch }) {
    if (!user?.id) throw new Error("user is required.");
    if (!batch?.id) {
        throw structuredError({
            code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
            message: "ERICH registration batch was not found.",
        });
    }

    if (canManageOwnErichRecord(user, batch)) return true;

    throw structuredError({
        code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
        message: "ERICH registration batch was not found.",
    });
}

export function erichRegistrationBatchInclude() {
    return {
        account: {
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
                billingName: true,
                billingStreet: true,
                billingStreet2: true,
                billingPostalCode: true,
                billingCity: true,
                billingCountry: true,
            },
        },
        raceEntries: {
            include: {
                athlete: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        birthYear: true,
                        clubId: true,
                    },
                },
                raceDefinition: {
                    select: {
                        id: true,
                        raceNumber: true,
                        classLabel: true,
                        distanceLabel: true,
                        gender: true,
                    },
                },
                valuations: {
                    select: {
                        level: true,
                        status: true,
                        dependsOnLicenseCheck: true,
                    },
                },
            },
            orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
        },
        teamEntries: {
            orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
        },
        payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
                id: true,
                provider: true,
                amountCents: true,
                feeCents: true,
                currency: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                attempts: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        provider: true,
                        providerAttemptId: true,
                        paymentMethod: true,
                        status: true,
                        amountCents: true,
                        feeCents: true,
                        currency: true,
                        checkoutUrl: true,
                        expiresAt: true,
                        providerPayload: true,
                        createdAt: true,
                    },
                },
            },
        },
    };
}

export async function listRegistrationBatches(store, { user, eventId = null }) {
    if (!user?.id) throw new Error("user is required.");

    const batches = await store.erichRegistrationBatch.findMany({
        where: getErichRegistrationAccessWhere(user, eventId),
        include: erichRegistrationBatchInclude(),
        orderBy: { createdAt: "desc" },
    });

    return batches.map((batch) => ({
        ...batch,
        summary: buildRegistrationBatchSummary(batch),
    }));
}

export async function getRegistrationBatch(store, { user, batchId }) {
    if (!batchId) {
        throw structuredError({
            code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
            message: "ERICH registration batch was not found.",
        });
    }

    const batch = await store.erichRegistrationBatch.findUnique({
        where: { id: batchId },
        include: erichRegistrationBatchInclude(),
    });

    assertCanAccessRegistrationBatch({ user, batch });

    return {
        ...batch,
        summary: buildRegistrationBatchSummary(batch),
    };
}

export async function createOrReuseTemporaryRegistrationBatch(store, {
    user,
    eventId,
    accountId = user?.id,
    now = new Date(),
}) {
    if (!user?.id) throw new Error("user is required.");
    if (!eventId) throw new Error("eventId is required.");
    if (!accountId) throw new Error("accountId is required.");

    if (accountId !== user.id && !canManageOwnErichRecord(user, { eventId, accountId })) {
        throw structuredError({
            code: "ERICH_PERMISSION_DENIED",
            message: "ERICH permission denied.",
        });
    }

    const event = await store.erichEvent.findUnique({
        where: { id: eventId },
        select: {
            id: true,
            status: true,
        },
    });

    if (!event) {
        throw structuredError({
            code: "ERICH_EVENT_NOT_FOUND",
            message: "ERICH event was not found.",
        });
    }

    if (event.status !== "ACTIVE") {
        throw structuredError({
            code: "ERICH_EVENT_NOT_REGISTERABLE",
            message: "ERICH event is not open for registration.",
            details: { status: event.status },
        });
    }

    await store.$transaction(async (tx) => {
        const expiredCheckout = await tx.erichRegistrationBatch.findFirst({
            where: {
                eventId,
                accountId,
                status: "CHECKOUT",
                checkoutExpiresAt: { lte: now },
            },
            orderBy: { checkoutExpiresAt: "asc" },
        });

        if (!expiredCheckout) return;

        const transition = await expireCheckoutBatch(tx, expiredCheckout, { now });
        if (transition.action !== "expired-checkout") return;

        await writeErichAuditLog({
            store: tx,
            eventId,
            actorId: user.id,
            entityType: "ErichRegistrationBatch",
            entityId: expiredCheckout.id,
            action: "registration_batch.checkout_expired",
            reason: "ERICH checkout expired before a new draft was created",
            oldValue: {
                status: expiredCheckout.status,
                checkoutExpiresAt: expiredCheckout.checkoutExpiresAt,
            },
            newValue: {
                status: "INVALID",
                invalidatedAt: now,
                expiredPaymentCount: transition.expiredPaymentCount,
            },
        });
    });

    const existing = await store.erichRegistrationBatch.findFirst({
        where: {
            eventId,
            accountId,
            status: "TEMPORARY",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        include: erichRegistrationBatchInclude(),
        orderBy: { createdAt: "desc" },
    });

    if (existing) {
        return {
            batch: {
                ...existing,
                summary: buildRegistrationBatchSummary(existing),
            },
            reused: true,
        };
    }

    const batch = await store.erichRegistrationBatch.create({
        data: createTemporaryRegistrationBatchData({ eventId, accountId, now }),
        include: erichRegistrationBatchInclude(),
    });

    await writeErichAuditLog({
        store,
        eventId,
        actorId: user.id,
        entityType: "ErichRegistrationBatch",
        entityId: batch.id,
        action: "registration_batch.created",
        reason: "ERICH registration draft created",
        oldValue: null,
        newValue: {
            eventId,
            accountId,
            status: batch.status,
            expiresAt: batch.expiresAt,
        },
    });

    return {
        batch: {
            ...batch,
            summary: buildRegistrationBatchSummary(batch),
        },
        reused: false,
    };
}

function buildErichPaymentReference(paymentId) {
    const normalizedId = String(paymentId).replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
    return `ERICH-${normalizedId}`;
}

function buildManualPaymentPayload({ paymentId, provider, now }) {
    const dueDate = getManualPaymentDueDate(now);

    return {
        mode: provider,
        manualPayment: {
            paymentMethod: provider,
            paymentMethodLabel: provider === "INVOICE" ? "Rechnung" : "Bankueberweisung",
            paymentReference: buildErichPaymentReference(paymentId),
            dueDate: dueDate.toISOString(),
            iban: process.env.BANK_TRANSFER_IBAN || null,
            bic: process.env.BANK_TRANSFER_BIC || null,
            accountHolder: process.env.BANK_TRANSFER_ACCOUNT_HOLDER || "GateKeeper",
        },
    };
}

function buildPayPalUrls({ origin, batchId, paymentId }) {
    if (!origin) {
        throw structuredError({
            code: "ERICH_PAYMENT_RETURN_URL_REQUIRED",
            message: "ERICH PayPal checkout requires a request origin.",
        });
    }

    const returnUrl = new URL("/erich/register", origin);
    returnUrl.searchParams.set("erichBatchId", batchId);
    returnUrl.searchParams.set("erichPaymentId", paymentId);
    returnUrl.searchParams.set("paymentProvider", "PAYPAL");

    const cancelUrl = new URL("/erich/register", origin);
    cancelUrl.searchParams.set("erichBatchId", batchId);
    cancelUrl.searchParams.set("paymentCancelled", "1");

    return {
        returnUrl: returnUrl.toString(),
        cancelUrl: cancelUrl.toString(),
    };
}

function buildStripeUrls({ origin, batchId, paymentId }) {
    if (!origin) {
        throw structuredError({
            code: "ERICH_PAYMENT_RETURN_URL_REQUIRED",
            message: "ERICH Stripe checkout requires a request origin.",
        });
    }

    const returnUrl = new URL("/erich/register", origin);
    returnUrl.searchParams.set("erichBatchId", batchId);
    returnUrl.searchParams.set("erichPaymentId", paymentId);
    returnUrl.searchParams.set("paymentProvider", "STRIPE");
    returnUrl.searchParams.set("paymentStarted", "1");

    const cancelUrl = new URL("/erich/register", origin);
    cancelUrl.searchParams.set("erichBatchId", batchId);
    cancelUrl.searchParams.set("paymentCancelled", "1");
    cancelUrl.searchParams.set("paymentProvider", "STRIPE");

    return {
        returnUrl: returnUrl.toString(),
        cancelUrl: cancelUrl.toString(),
    };
}

async function preparePayPalCheckout({
    store,
    batch,
    payment,
    paymentAttempt,
    summary,
    origin,
    paypal = { isConfigured: isPayPalConfigured, createOrder: createPayPalOrder },
}) {
    if (!paypal.isConfigured()) {
        throw structuredError({
            code: "ERICH_PAYPAL_NOT_CONFIGURED",
            message: "PayPal is not configured for ERICH checkout.",
        });
    }

    const urls = buildPayPalUrls({ origin, batchId: batch.id, paymentId: payment.id });
    const order = await paypal.createOrder({
        bookingId: payment.id,
        referenceId: payment.id,
        customId: batch.id,
        eventTitle: batch.event?.name ?? "ERICH Registrierung",
        description: `ERICH Registrierung ${batch.event?.name ?? batch.eventId}`,
        amountCents: summary.totalCents,
        currency: summary.currency,
        brandName: "ERICH",
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
    });

    if (!order.orderId || !order.approvalUrl) {
        throw structuredError({
            code: "ERICH_PAYPAL_ORDER_INVALID",
            message: "PayPal order creation did not return an approval URL.",
        });
    }

    const [updatedPayment, updatedAttempt] = await Promise.all([
        store.erichPayment.update({
            where: { id: payment.id },
            data: {
                providerPaymentId: order.orderId,
            },
        }),
        store.erichPaymentAttempt.update({
            where: { id: paymentAttempt.id },
            data: {
                providerAttemptId: order.orderId,
                checkoutUrl: order.approvalUrl,
                providerPayload: order.raw,
            },
        }),
    ]);

    return {
        payment: updatedPayment,
        paymentAttempt: updatedAttempt,
        order,
    };
}

async function prepareStripeCheckout({
    store,
    batch,
    payment,
    paymentAttempt,
    summary,
    origin,
    stripe = { isConfigured: isStripeConfigured, createCheckoutSession: createStripeCheckoutSession },
}) {
    if (!stripe.isConfigured()) {
        throw structuredError({
            code: "ERICH_STRIPE_NOT_CONFIGURED",
            message: "Stripe is not configured for ERICH checkout.",
        });
    }

    const urls = buildStripeUrls({ origin, batchId: batch.id, paymentId: payment.id });
    const session = await stripe.createCheckoutSession({
        paymentId: payment.id,
        batchId: batch.id,
        eventTitle: batch.event?.name ?? "ERICH Registrierung",
        description: `ERICH Registrierung ${batch.event?.name ?? batch.eventId}`,
        amountCents: summary.totalCents,
        currency: summary.currency,
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
    });

    if (!session.sessionId || !session.checkoutUrl) {
        throw structuredError({
            code: "ERICH_STRIPE_SESSION_INVALID",
            message: "Stripe checkout session creation did not return a checkout URL.",
        });
    }

    const [updatedPayment, updatedAttempt] = await Promise.all([
        store.erichPayment.update({
            where: { id: payment.id },
            data: {
                providerPaymentId: session.sessionId,
            },
        }),
        store.erichPaymentAttempt.update({
            where: { id: paymentAttempt.id },
            data: {
                providerAttemptId: session.sessionId,
                checkoutUrl: session.checkoutUrl,
                providerPayload: session.raw,
            },
        }),
    ]);

    return {
        payment: updatedPayment,
        paymentAttempt: updatedAttempt,
        session,
    };
}

function extractPayPalCaptureId(captureResult) {
    return captureResult?.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
}

export async function startRegistrationCheckout(store, {
    user,
    batchId,
    provider = ERICH_REGISTRATION_CHECKOUT_PROVIDERS.BANK_TRANSFER,
    now = new Date(),
    origin = null,
    paypal = undefined,
    stripe = undefined,
}) {
    if (!Object.values(ERICH_REGISTRATION_CHECKOUT_PROVIDERS).includes(provider)) {
        throw structuredError({
            code: "ERICH_PAYMENT_PROVIDER_UNSUPPORTED",
            message: "ERICH payment provider is not supported yet.",
            details: { provider },
        });
    }

    const paypalServices = paypal ?? { isConfigured: isPayPalConfigured, createOrder: createPayPalOrder };
    if (provider === ERICH_REGISTRATION_CHECKOUT_PROVIDERS.PAYPAL && !paypalServices.isConfigured()) {
        throw structuredError({
            code: "ERICH_PAYPAL_NOT_CONFIGURED",
            message: "PayPal is not configured for ERICH checkout.",
        });
    }
    const stripeServices = stripe ?? {
        isConfigured: isStripeConfigured,
        createCheckoutSession: createStripeCheckoutSession,
    };
    if (provider === ERICH_REGISTRATION_CHECKOUT_PROVIDERS.STRIPE && !stripeServices.isConfigured()) {
        throw structuredError({
            code: "ERICH_STRIPE_NOT_CONFIGURED",
            message: "Stripe is not configured for ERICH checkout.",
        });
    }

    const result = await store.$transaction(async (tx) => {
        const batch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batchId },
            include: {
                ...erichRegistrationBatchInclude(),
                event: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
        });

        assertCanAccessRegistrationBatch({ user, batch });

        const summary = buildRegistrationBatchSummary(batch);
        const transition = prepareCheckoutTransition({ batch, summary, now });
        const isManualProvider = MANUAL_CHECKOUT_PROVIDERS.has(provider);
        if (isManualProvider) {
            transition.checkoutExpiresAt = getManualPaymentDueDate(now);
        }
        const checkout = await markRegistrationBatchCheckout(tx, batch, transition);

        if (checkout.action !== "checkout") {
            throw structuredError({
                code: "ERICH_REGISTRATION_CHECKOUT_CONFLICT",
                message: "ERICH registration checkout could not be started.",
                details: { reason: checkout.reason },
            });
        }

        const payment = await tx.erichPayment.create({
            data: prepareInitialPaymentData({
                eventId: batch.eventId,
                registrationBatchId: batch.id,
                accountId: batch.accountId,
                provider,
                summary,
                status: isManualProvider
                    ? ERICH_PAYMENT_STATUS.PENDING
                    : ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
            }),
        });
        const providerPayload = isManualProvider
            ? buildManualPaymentPayload({ paymentId: payment.id, provider, now })
            : {
                mode: provider,
                registrationBatchId: batch.id,
            };
        const paymentAttempt = await tx.erichPaymentAttempt.create({
            data: prepareInitialPaymentAttemptData({
                paymentId: payment.id,
                provider,
                providerAttemptId: `${provider.toLowerCase()}-${payment.id}`,
                summary,
                checkoutExpiresAt: transition.checkoutExpiresAt,
                paymentMethod: provider,
                status: isManualProvider
                    ? ERICH_PAYMENT_STATUS.PENDING
                    : ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
                providerPayload,
            }),
        });

        await writeErichAuditLog({
            store: tx,
            eventId: batch.eventId,
            actorId: user.id,
            entityType: "ErichRegistrationBatch",
            entityId: batch.id,
            action: "registration_batch.checkout_started",
            reason: isManualProvider
                ? "ERICH manual checkout started"
                : "ERICH simulated checkout started",
            oldValue: {
                status: batch.status,
            },
            newValue: {
                status: transition.status,
                submittedAt: transition.submittedAt,
                checkoutExpiresAt: transition.checkoutExpiresAt,
                totalCents: summary.totalCents,
                currency: summary.currency,
                paymentProvider: provider,
            },
            metadata: {
                summary,
                paymentId: payment.id,
                paymentAttemptId: paymentAttempt.id,
            },
        });

        const updatedBatch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batch.id },
            include: {
                ...erichRegistrationBatchInclude(),
                event: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
        });
        const unifiedBookingSync = await syncUnifiedBookingFromErichBatch(tx, {
            batch: updatedBatch,
            now,
        });

        return {
            batch: {
                ...updatedBatch,
                summary: buildRegistrationBatchSummary(updatedBatch),
            },
            payment,
            paymentAttempt,
            checkout: {
                provider,
                paymentId: payment.id,
                paymentAttemptId: paymentAttempt.id,
                checkoutUrl: paymentAttempt.checkoutUrl,
                expiresAt: paymentAttempt.expiresAt,
                requiresRedirect: Boolean(paymentAttempt.checkoutUrl),
                status: paymentAttempt.status,
                manualPayment: providerPayload.manualPayment ?? null,
            },
            summary,
            unifiedBookingSync,
        };
    });

    if (
        provider !== ERICH_REGISTRATION_CHECKOUT_PROVIDERS.PAYPAL &&
        provider !== ERICH_REGISTRATION_CHECKOUT_PROVIDERS.STRIPE
    ) {
        return result;
    }

    if (provider === ERICH_REGISTRATION_CHECKOUT_PROVIDERS.STRIPE) {
        const stripeCheckout = await prepareStripeCheckout({
            store,
            batch: result.batch,
            payment: result.payment,
            paymentAttempt: result.paymentAttempt,
            summary: result.summary,
            origin,
            stripe: stripeServices,
        });

        return {
            ...result,
            payment: stripeCheckout.payment,
            paymentAttempt: stripeCheckout.paymentAttempt,
            checkout: {
                ...result.checkout,
                paymentId: stripeCheckout.payment.id,
                paymentAttemptId: stripeCheckout.paymentAttempt.id,
                checkoutUrl: stripeCheckout.paymentAttempt.checkoutUrl,
                requiresRedirect: true,
                providerSessionId: stripeCheckout.session.sessionId,
            },
        };
    }

    const paypalCheckout = await preparePayPalCheckout({
        store,
        batch: result.batch,
        payment: result.payment,
        paymentAttempt: result.paymentAttempt,
        summary: result.summary,
        origin,
        paypal: paypalServices,
    });

    return {
        ...result,
        payment: paypalCheckout.payment,
        paymentAttempt: paypalCheckout.paymentAttempt,
        checkout: {
            ...result.checkout,
            paymentId: paypalCheckout.payment.id,
            paymentAttemptId: paypalCheckout.paymentAttempt.id,
            checkoutUrl: paypalCheckout.paymentAttempt.checkoutUrl,
            requiresRedirect: true,
            providerOrderId: paypalCheckout.order.orderId,
        },
    };
}

export async function captureRegistrationPayPalCheckout(store, {
    user,
    batchId,
    orderId,
    now = new Date(),
    paypal = { captureOrder: capturePayPalOrder },
}) {
    if (!user?.id) throw new Error("user is required.");
    if (!batchId) throw new Error("batchId is required.");
    if (!orderId) {
        throw structuredError({
            code: "ERICH_PAYPAL_ORDER_REQUIRED",
            message: "PayPal order is required.",
        });
    }

    const batch = await store.erichRegistrationBatch.findUnique({
        where: { id: batchId },
        include: erichRegistrationBatchInclude(),
    });
    assertCanAccessRegistrationBatch({ user, batch });

    if (batch.status === "PAID") {
        return {
            batch: {
                ...batch,
                summary: buildRegistrationBatchSummary(batch),
            },
            payment: null,
            paymentAttempt: null,
            capture: null,
            alreadyPaid: true,
        };
    }

    if (batch.status !== "CHECKOUT") {
        throw structuredError({
            code: "ERICH_REGISTRATION_STATUS_INVALID",
            message: `Registration batch cannot capture PayPal from ${batch.status}.`,
            details: { status: batch.status },
        });
    }

    const payment = await store.erichPayment.findFirst({
        where: {
            registrationBatchId: batch.id,
            provider: ERICH_REGISTRATION_CHECKOUT_PROVIDERS.PAYPAL,
            providerPaymentId: orderId,
        },
        include: {
            attempts: {
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    if (!payment) {
        throw structuredError({
            code: "ERICH_PAYPAL_PAYMENT_NOT_FOUND",
            message: "PayPal payment was not found for this ERICH batch.",
        });
    }
    const paymentAttempt = payment.attempts?.[0] ?? null;
    if (!paymentAttempt) {
        throw structuredError({
            code: "ERICH_PAYPAL_PAYMENT_ATTEMPT_NOT_FOUND",
            message: "PayPal payment attempt was not found for this ERICH batch.",
        });
    }

    const capture = await paypal.captureOrder(orderId);
    const captureId = extractPayPalCaptureId(capture);

    return store.$transaction(async (tx) => {
        const currentBatch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batch.id },
            include: erichRegistrationBatchInclude(),
        });
        assertCanAccessRegistrationBatch({ user, batch: currentBatch });

        const transition = await markRegistrationBatchPaid(tx, currentBatch, { paidAt: now });
        if (transition.action !== "paid" && transition.reason !== "already-paid") {
            throw structuredError({
                code: "ERICH_REGISTRATION_CHECKOUT_CONFLICT",
                message: "ERICH registration could not be marked as paid.",
                details: { reason: transition.reason },
            });
        }

        const [updatedPayment, updatedAttempt] = await Promise.all([
            tx.erichPayment.update({
                where: { id: payment.id },
                data: {
                    status: ERICH_PAYMENT_STATUS.SUCCESSFUL,
                    providerPaymentId: orderId,
                },
            }),
            tx.erichPaymentAttempt.update({
                where: { id: paymentAttempt.id },
                data: {
                    status: ERICH_PAYMENT_STATUS.SUCCESSFUL,
                    providerAttemptId: orderId,
                    providerPayload: {
                        capture,
                        captureId,
                    },
                },
            }),
        ]);

        await writeErichAuditLog({
            store: tx,
            eventId: currentBatch.eventId,
            actorId: user.id,
            entityType: "ErichRegistrationBatch",
            entityId: currentBatch.id,
            action: "registration_batch.paypal_captured",
            reason: "ERICH PayPal checkout captured",
            oldValue: {
                status: currentBatch.status,
            },
            newValue: {
                status: "PAID",
                paidAt: now,
                providerPaymentId: orderId,
                providerCaptureId: captureId,
            },
            metadata: {
                paymentId: payment.id,
                paymentAttemptId: updatedAttempt.id,
            },
        });

        const updatedBatch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batch.id },
            include: erichRegistrationBatchInclude(),
        });
        const unifiedBookingSync = await syncUnifiedBookingFromErichBatch(tx, {
            batch: updatedBatch,
            now,
        });

        return {
            batch: {
                ...updatedBatch,
                summary: buildRegistrationBatchSummary(updatedBatch),
            },
            payment: updatedPayment,
            paymentAttempt: updatedAttempt,
            capture,
            alreadyPaid: false,
            unifiedBookingSync,
        };
    });
}

export async function captureRegistrationStripeCheckout(store, {
    user,
    batchId,
    sessionId,
    now = new Date(),
    stripe = { retrieveCheckoutSession: retrieveStripeCheckoutSession },
}) {
    if (!user?.id) throw new Error("user is required.");
    if (!batchId) throw new Error("batchId is required.");
    if (!sessionId) {
        throw structuredError({
            code: "ERICH_STRIPE_SESSION_REQUIRED",
            message: "Stripe checkout session is required.",
        });
    }

    const batch = await store.erichRegistrationBatch.findUnique({
        where: { id: batchId },
        include: erichRegistrationBatchInclude(),
    });
    assertCanAccessRegistrationBatch({ user, batch });

    if (batch.status === "PAID") {
        return {
            batch: {
                ...batch,
                summary: buildRegistrationBatchSummary(batch),
            },
            payment: null,
            paymentAttempt: null,
            session: null,
            alreadyPaid: true,
        };
    }

    if (batch.status !== "CHECKOUT") {
        throw structuredError({
            code: "ERICH_REGISTRATION_STATUS_INVALID",
            message: `Registration batch cannot capture Stripe from ${batch.status}.`,
            details: { status: batch.status },
        });
    }

    const payment = await store.erichPayment.findFirst({
        where: {
            registrationBatchId: batch.id,
            provider: ERICH_REGISTRATION_CHECKOUT_PROVIDERS.STRIPE,
            providerPaymentId: sessionId,
        },
        include: {
            attempts: {
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    if (!payment) {
        throw structuredError({
            code: "ERICH_STRIPE_PAYMENT_NOT_FOUND",
            message: "Stripe payment was not found for this ERICH batch.",
        });
    }
    const paymentAttempt = payment.attempts?.[0] ?? null;
    if (!paymentAttempt) {
        throw structuredError({
            code: "ERICH_STRIPE_PAYMENT_ATTEMPT_NOT_FOUND",
            message: "Stripe payment attempt was not found for this ERICH batch.",
        });
    }

    const session = await stripe.retrieveCheckoutSession(sessionId);
    if (session.paymentStatus !== "paid") {
        throw structuredError({
            code: "ERICH_STRIPE_PAYMENT_NOT_COMPLETED",
            message: "Stripe payment is not completed yet.",
            details: {
                paymentStatus: session.paymentStatus,
                sessionStatus: session.status,
            },
        });
    }

    return store.$transaction(async (tx) => {
        const currentBatch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batch.id },
            include: erichRegistrationBatchInclude(),
        });
        assertCanAccessRegistrationBatch({ user, batch: currentBatch });

        const transition = await markRegistrationBatchPaid(tx, currentBatch, { paidAt: now });
        if (transition.action !== "paid" && transition.reason !== "already-paid") {
            throw structuredError({
                code: "ERICH_REGISTRATION_CHECKOUT_CONFLICT",
                message: "ERICH registration could not be marked as paid.",
                details: { reason: transition.reason },
            });
        }

        const providerPayload = {
            checkoutSession: session.raw,
            checkoutSessionId: session.sessionId,
            paymentIntentId: session.paymentIntentId,
        };

        const [updatedPayment, updatedAttempt] = await Promise.all([
            tx.erichPayment.update({
                where: { id: payment.id },
                data: {
                    status: ERICH_PAYMENT_STATUS.SUCCESSFUL,
                    providerPaymentId: session.sessionId,
                },
            }),
            tx.erichPaymentAttempt.update({
                where: { id: paymentAttempt.id },
                data: {
                    status: ERICH_PAYMENT_STATUS.SUCCESSFUL,
                    providerAttemptId: session.sessionId,
                    providerPayload,
                },
            }),
        ]);

        await writeErichAuditLog({
            store: tx,
            eventId: currentBatch.eventId,
            actorId: user.id,
            entityType: "ErichRegistrationBatch",
            entityId: currentBatch.id,
            action: "registration_batch.stripe_captured",
            reason: "ERICH Stripe checkout captured after return",
            oldValue: {
                status: currentBatch.status,
            },
            newValue: {
                status: "PAID",
                paidAt: now,
                providerPaymentId: session.sessionId,
                providerPaymentIntentId: session.paymentIntentId,
            },
            metadata: {
                paymentId: payment.id,
                paymentAttemptId: updatedAttempt.id,
            },
        });

        const updatedBatch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batch.id },
            include: erichRegistrationBatchInclude(),
        });
        const unifiedBookingSync = await syncUnifiedBookingFromErichBatch(tx, {
            batch: updatedBatch,
            now,
        });

        return {
            batch: {
                ...updatedBatch,
                summary: buildRegistrationBatchSummary(updatedBatch),
            },
            payment: updatedPayment,
            paymentAttempt: updatedAttempt,
            session,
            alreadyPaid: transition.reason === "already-paid",
            unifiedBookingSync,
        };
    });
}
