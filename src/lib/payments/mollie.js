import { getMollieConfig } from "../env.js";
import {
    centsToEuros,
    validatePaymentProviderAdapter,
} from "./domain.js";

const MOLLIE_METHODS = Object.freeze({
    MOLLIE_PAY_BY_BANK: "paybybank",
    STRIPE: "creditcard",
    PAYPAL: "paypal",
});

const STATUS_MAP = Object.freeze({
    open: "PENDING",
    pending: "PROCESSING",
    authorized: "PROCESSING",
    paid: "SUCCEEDED",
    failed: "FAILED",
    canceled: "CANCELLED",
    expired: "CANCELLED",
});

function formatAmount(amountCents) {
    return centsToEuros(amountCents).toFixed(2);
}

function getCheckoutUrl(payment) {
    return payment?._links?.checkout?.href ?? null;
}

function normalizeMolliePayment(payment) {
    return {
        id: payment.id,
        checkoutUrl: getCheckoutUrl(payment),
        paymentId: payment.id,
        status: normalizeMollieStatus(payment.status),
        providerStatus: payment.status ?? null,
        raw: payment,
    };
}

export function isMollieConfigured(env = process.env) {
    return getMollieConfig(env).enabled;
}

export function normalizeMollieStatus(status) {
    return STATUS_MAP[String(status ?? "").toLowerCase()] ?? "PENDING";
}

export function buildMolliePaymentPayload(request, config = getMollieConfig()) {
    if (!request?.bookingId) throw new Error("bookingId is required.");
    if (!request.returnUrl || !request.cancelUrl) {
        throw new Error("Mollie redirect and cancel URLs are required.");
    }

    const method = MOLLIE_METHODS[request.method] ?? "paybybank";

    return {
        amount: {
            currency: request.currency || config.currency || "EUR",
            value: formatAmount(request.amountCents),
        },
        description: request.metadata?.description || `GateKeeper booking ${request.bookingId}`,
        method,
        redirectUrl: request.returnUrl,
        cancelUrl: request.cancelUrl,
        webhookUrl: request.webhookUrl,
        metadata: {
            gatekeeperPaymentId: request.gatekeeperPaymentId,
            bookingId: request.bookingId,
            eventId: request.metadata?.eventId ?? null,
        },
    };
}

async function requestMollie(path, { method = "GET", body } = {}, config = getMollieConfig()) {
    if (!config.enabled || !config.apiKey) {
        throw new Error("Mollie is not configured.");
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.detail || payload?.title || `Mollie request failed with ${response.status}.`);
    }

    return payload;
}

export function createMollieAdapter({ config = getMollieConfig(), fetchPayment = requestMollie } = {}) {
    const adapter = {
        async createPayment(request) {
            const payload = buildMolliePaymentPayload(request, config);
            const payment = await fetchPayment(
                "/payments",
                {
                    method: "POST",
                    body: payload,
                },
                config
            );
            return normalizeMolliePayment(payment);
        },

        async getPaymentStatus(payment) {
            const providerPaymentId = payment?.providerPaymentId ?? payment?.paymentId ?? payment?.id;
            if (!providerPaymentId) throw new Error("Mollie payment id is required.");
            const result = await fetchPayment(`/payments/${providerPaymentId}`, {}, config);
            return normalizeMolliePayment(result);
        },

        async refundPayment(payment, amountCents) {
            const providerPaymentId = payment?.providerPaymentId ?? payment?.paymentId ?? payment?.id;
            if (!providerPaymentId) throw new Error("Mollie payment id is required.");
            return fetchPayment(
                `/payments/${providerPaymentId}/refunds`,
                {
                    method: "POST",
                    body: {
                        amount: {
                            currency: payment.currency || config.currency || "EUR",
                            value: formatAmount(amountCents),
                        },
                    },
                },
                config
            );
        },

        async cancelPayment(payment) {
            const providerPaymentId = payment?.providerPaymentId ?? payment?.paymentId ?? payment?.id;
            if (!providerPaymentId) throw new Error("Mollie payment id is required.");
            const result = await fetchPayment(
                `/payments/${providerPaymentId}`,
                {
                    method: "DELETE",
                },
                config
            );
            return {
                id: providerPaymentId,
                status: "CANCELLED",
                raw: result,
            };
        },

        async handleWebhook(event) {
            const providerPaymentId = event?.id ?? event?.body?.id ?? event?.providerPaymentId;
            if (!providerPaymentId) throw new Error("Mollie webhook payment id is required.");
            return adapter.getPaymentStatus({ providerPaymentId });
        },
    };

    validatePaymentProviderAdapter(adapter);
    return adapter;
}
