import { assertCentAmount, assertCurrency } from "./money.js";

export const ERICH_REGISTRATION_STATUS = Object.freeze({
    TEMPORARY: "TEMPORARY",
    CHECKOUT: "CHECKOUT",
    PAID: "PAID",
    INVALID: "INVALID",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
});

export const ERICH_PAYMENT_STATUS = Object.freeze({
    OPEN: "OPEN",
    CHECKOUT_ACTIVE: "CHECKOUT_ACTIVE",
    PENDING: "PENDING",
    SUCCESSFUL: "SUCCESSFUL",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    CHARGED_BACK: "CHARGED_BACK",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    FULLY_REFUNDED: "FULLY_REFUNDED",
});

export const ERICH_REGISTRATION_WINDOWS_MS = Object.freeze({
    TEMPORARY_DRAFT: 15 * 60 * 1000,
    CHECKOUT: 20 * 60 * 1000,
    ASYNC_PAYMENT_PENDING: 24 * 60 * 60 * 1000,
});

const BILLABLE_RACE_ENTRY_STATUSES = new Set(["ACTIVE"]);
const BILLABLE_TEAM_ENTRY_STATUSES = new Set(["ACTIVE", "TEMPORARY"]);
const CHECKOUT_EXPIRABLE_PAYMENT_STATUSES = Object.freeze([
    ERICH_PAYMENT_STATUS.OPEN,
    ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
]);

function addMs(date, durationMs) {
    return new Date(date.getTime() + durationMs);
}

function transitionResult(action, batch, result, successReason = null) {
    return {
        action: result.count === 1 ? action : "ignored",
        reason: result.count === 1 ? successReason : "concurrent-update",
        registrationBatchId: batch?.id ?? null,
    };
}

export function createTemporaryRegistrationBatchData({
    eventId,
    accountId,
    now = new Date(),
    draftTtlMs = ERICH_REGISTRATION_WINDOWS_MS.TEMPORARY_DRAFT,
}) {
    if (!eventId) throw new Error("eventId is required.");
    if (!accountId) throw new Error("accountId is required.");

    return {
        eventId,
        accountId,
        status: ERICH_REGISTRATION_STATUS.TEMPORARY,
        expiresAt: addMs(now, draftTtlMs),
    };
}

export function isRegistrationBatchExpired(batch, now = new Date()) {
    if (!batch?.expiresAt) return false;
    return new Date(batch.expiresAt).getTime() <= now.getTime();
}

export function isCheckoutExpired(batch, now = new Date()) {
    if (!batch?.checkoutExpiresAt) return false;
    return new Date(batch.checkoutExpiresAt).getTime() <= now.getTime();
}

export function isAsyncPaymentPendingExpired(paymentAttempt, now = new Date()) {
    if (!paymentAttempt?.createdAt || paymentAttempt.status !== ERICH_PAYMENT_STATUS.PENDING) {
        return false;
    }

    return (
        addMs(new Date(paymentAttempt.createdAt), ERICH_REGISTRATION_WINDOWS_MS.ASYNC_PAYMENT_PENDING)
            .getTime() <= now.getTime()
    );
}

export function buildRegistrationChargeSummary({
    raceEntries = [],
    teamEntries = [],
    paymentFeeCents = 0,
    currency = "EUR",
} = {}) {
    const normalizedCurrency = assertCurrency(currency);
    const raceEntryCents = raceEntries
        .filter((entry) => BILLABLE_RACE_ENTRY_STATUSES.has(entry.status ?? "ACTIVE"))
        .reduce((sum, entry) => sum + assertCentAmount(entry.priceCents, "raceEntry.priceCents"), 0);
    const teamEntryCents = teamEntries
        .filter((entry) => BILLABLE_TEAM_ENTRY_STATUSES.has(entry.status ?? "ACTIVE"))
        .reduce((sum, entry) => sum + assertCentAmount(entry.priceCents, "teamEntry.priceCents"), 0);
    const normalizedPaymentFeeCents = assertCentAmount(paymentFeeCents, "paymentFeeCents");

    return {
        raceEntryCount: raceEntries.filter((entry) =>
            BILLABLE_RACE_ENTRY_STATUSES.has(entry.status ?? "ACTIVE")
        ).length,
        teamEntryCount: teamEntries.filter((entry) =>
            BILLABLE_TEAM_ENTRY_STATUSES.has(entry.status ?? "ACTIVE")
        ).length,
        raceEntryCents,
        teamEntryCents,
        paymentFeeCents: normalizedPaymentFeeCents,
        totalCents: raceEntryCents + teamEntryCents + normalizedPaymentFeeCents,
        currency: normalizedCurrency,
    };
}

export function assertRegistrationBatchCanStartCheckout({ batch, summary, now = new Date() }) {
    if (!batch?.id) throw new Error("registration batch is required.");

    if (batch.status !== ERICH_REGISTRATION_STATUS.TEMPORARY) {
        const error = new Error(`Registration batch cannot start checkout from ${batch.status}.`);
        error.code = "ERICH_REGISTRATION_STATUS_INVALID";
        error.status = batch.status;
        throw error;
    }

    if (isRegistrationBatchExpired(batch, now)) {
        const error = new Error("Registration batch draft has expired.");
        error.code = "ERICH_REGISTRATION_DRAFT_EXPIRED";
        throw error;
    }

    if (summary && summary.totalCents <= 0) {
        const error = new Error("Registration batch cannot start checkout without billable entries.");
        error.code = "ERICH_REGISTRATION_EMPTY";
        throw error;
    }

    return true;
}

export function assertRegistrationBatchCanBeEdited({ batch, now = new Date() }) {
    if (!batch?.id) throw new Error("registration batch is required.");

    if (batch.status !== ERICH_REGISTRATION_STATUS.TEMPORARY) {
        const error = new Error(`Registration batch cannot be edited from ${batch.status}.`);
        error.code = "ERICH_REGISTRATION_NOT_EDITABLE";
        error.status = batch.status;
        throw error;
    }

    if (isRegistrationBatchExpired(batch, now)) {
        const error = new Error("Registration batch draft has expired.");
        error.code = "ERICH_REGISTRATION_DRAFT_EXPIRED";
        throw error;
    }

    return true;
}

export function prepareCheckoutTransition({
    batch,
    summary,
    now = new Date(),
    checkoutWindowMs = ERICH_REGISTRATION_WINDOWS_MS.CHECKOUT,
}) {
    assertRegistrationBatchCanStartCheckout({ batch, summary, now });

    return {
        status: ERICH_REGISTRATION_STATUS.CHECKOUT,
        submittedAt: now,
        checkoutExpiresAt: addMs(now, checkoutWindowMs),
    };
}

export function prepareInitialPaymentData({
    eventId,
    registrationBatchId,
    accountId,
    provider,
    summary,
    status = ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
}) {
    if (!provider) throw new Error("payment provider is required.");

    return {
        eventId,
        registrationBatchId,
        accountId,
        provider,
        amountCents: assertCentAmount(summary?.totalCents, "summary.totalCents"),
        feeCents: assertCentAmount(summary?.paymentFeeCents ?? 0, "summary.paymentFeeCents"),
        currency: assertCurrency(summary?.currency ?? "EUR"),
        status,
    };
}

export function prepareInitialPaymentAttemptData({
    paymentId,
    provider,
    summary,
    checkoutExpiresAt = null,
    providerAttemptId = null,
    paymentMethod = provider,
    status = ERICH_PAYMENT_STATUS.CHECKOUT_ACTIVE,
    checkoutUrl = null,
    providerPayload = null,
}) {
    if (!paymentId) throw new Error("paymentId is required.");
    if (!provider) throw new Error("payment provider is required.");

    return {
        paymentId,
        provider,
        providerAttemptId,
        paymentMethod,
        status,
        amountCents: assertCentAmount(summary?.totalCents, "summary.totalCents"),
        feeCents: assertCentAmount(summary?.paymentFeeCents ?? 0, "summary.paymentFeeCents"),
        currency: assertCurrency(summary?.currency ?? "EUR"),
        checkoutUrl,
        expiresAt: checkoutExpiresAt,
        providerPayload,
    };
}

export function prepareExpiredCheckoutInvalidation({ batch, now = new Date() }) {
    if (!batch?.id) throw new Error("registration batch is required.");

    if (batch.status !== ERICH_REGISTRATION_STATUS.CHECKOUT) {
        return {
            action: "ignored",
            reason: `status-${batch.status}`,
            registrationBatchId: batch.id,
            batchData: null,
            paymentWhere: null,
            paymentData: null,
        };
    }

    if (!isCheckoutExpired(batch, now)) {
        return {
            action: "ignored",
            reason: "checkout-active",
            registrationBatchId: batch.id,
            batchData: null,
            paymentWhere: null,
            paymentData: null,
        };
    }

    return {
        action: "expire-checkout",
        reason: null,
        registrationBatchId: batch.id,
        batchData: {
            status: ERICH_REGISTRATION_STATUS.INVALID,
            invalidatedAt: now,
        },
        paymentWhere: {
            registrationBatchId: batch.id,
            status: {
                in: CHECKOUT_EXPIRABLE_PAYMENT_STATUSES,
            },
        },
        paymentData: {
            status: ERICH_PAYMENT_STATUS.EXPIRED,
        },
    };
}

export async function markRegistrationBatchCheckout(tx, batch, data) {
    if (!batch?.id) throw new Error("registration batch is required.");

    const result = await tx.erichRegistrationBatch.updateMany({
        where: {
            id: batch.id,
            status: ERICH_REGISTRATION_STATUS.TEMPORARY,
        },
        data,
    });

    return transitionResult("checkout", batch, result);
}

export async function markRegistrationBatchPaid(tx, batch, data = {}) {
    if (!batch?.id) throw new Error("registration batch is required.");

    if (batch.status === ERICH_REGISTRATION_STATUS.PAID) {
        return { action: "ignored", reason: "already-paid", registrationBatchId: batch.id };
    }

    if (batch.status !== ERICH_REGISTRATION_STATUS.CHECKOUT) {
        return {
            action: "ignored",
            reason: `status-${batch.status}`,
            registrationBatchId: batch.id,
        };
    }

    const result = await tx.erichRegistrationBatch.updateMany({
        where: {
            id: batch.id,
            status: ERICH_REGISTRATION_STATUS.CHECKOUT,
        },
        data: {
            ...data,
            status: ERICH_REGISTRATION_STATUS.PAID,
            paidAt: data.paidAt ?? new Date(),
        },
    });

    return transitionResult("paid", batch, result);
}

export async function markRegistrationBatchInvalid(tx, batch, data = {}) {
    if (!batch?.id) throw new Error("registration batch is required.");

    if (
        batch.status !== ERICH_REGISTRATION_STATUS.TEMPORARY &&
        batch.status !== ERICH_REGISTRATION_STATUS.CHECKOUT
    ) {
        return {
            action: "ignored",
            reason: `status-${batch.status}`,
            registrationBatchId: batch.id,
        };
    }

    const result = await tx.erichRegistrationBatch.updateMany({
        where: {
            id: batch.id,
            status: batch.status,
        },
        data: {
            ...data,
            status: ERICH_REGISTRATION_STATUS.INVALID,
            invalidatedAt: data.invalidatedAt ?? new Date(),
        },
    });

    return transitionResult("invalidated", batch, result);
}

export async function expireCheckoutBatch(tx, batch, { now = new Date() } = {}) {
    const transition = prepareExpiredCheckoutInvalidation({ batch, now });

    if (transition.action !== "expire-checkout") {
        return transition;
    }

    const result = await tx.erichRegistrationBatch.updateMany({
        where: {
            id: batch.id,
            status: ERICH_REGISTRATION_STATUS.CHECKOUT,
        },
        data: transition.batchData,
    });

    if (result.count !== 1) {
        return transitionResult("expire-checkout", batch, result);
    }

    const paymentResult = await tx.erichPayment.updateMany({
        where: transition.paymentWhere,
        data: transition.paymentData,
    });

    return {
        action: "expired-checkout",
        reason: null,
        registrationBatchId: batch.id,
        expiredPaymentCount: paymentResult.count,
    };
}
