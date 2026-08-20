import { getPayPalConfig } from "./env.js";

export function isPayPalConfigured() {
    const config = getPayPalConfig();
    return config.enabled;
}

async function getAccessToken() {
    const config = getPayPalConfig();
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!config.enabled || !clientId || !clientSecret) {
        throw new Error("PayPal is not configured.");
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });

    if (!response.ok) {
        throw new Error(`PayPal auth failed: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

async function paypalRequest(path, options = {}) {
    const config = getPayPalConfig();
    const accessToken = await getAccessToken();
    const response = await fetch(`${config.baseUrl}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.message || data?.name || `PayPal request failed: ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function readHeader(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] || headers[name.toLowerCase()] || null;
}

export async function verifyPayPalWebhookSignature({ headers, event }) {
    const config = getPayPalConfig();

    if (!config.webhookEnabled || !config.webhookId) {
        throw new Error("PayPal webhook verification is not configured.");
    }

    const payload = {
        auth_algo: readHeader(headers, "paypal-auth-algo"),
        cert_url: readHeader(headers, "paypal-cert-url"),
        transmission_id: readHeader(headers, "paypal-transmission-id"),
        transmission_sig: readHeader(headers, "paypal-transmission-sig"),
        transmission_time: readHeader(headers, "paypal-transmission-time"),
        webhook_id: config.webhookId,
        webhook_event: event,
    };

    const missing = Object.entries(payload)
        .filter(([key, value]) => key !== "webhook_event" && !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        return false;
    }

    const result = await paypalRequest("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return result?.verification_status === "SUCCESS";
}

export async function createPayPalOrder({
                                            bookingId,
                                            eventTitle,
                                            totalAmount,
                                            amountCents = null,
                                            currency = null,
                                            referenceId = bookingId,
                                            customId = bookingId,
                                            description = eventTitle,
                                            brandName = "GateKeeper",
                                            returnUrl,
                                            cancelUrl,
                                            merchantEmail, // Neu: Die PayPal-E-Mail-Adresse des Veranstalters
                                        }) {
    const config = getPayPalConfig();
    const amountValue =
        amountCents === null || amountCents === undefined
            ? Number(totalAmount).toFixed(2)
            : (Number(amountCents) / 100).toFixed(2);
    const payload = {
        intent: "CAPTURE",
        purchase_units: [
            {
                reference_id: String(referenceId),
                description,
                custom_id: String(customId),
                amount: {
                    currency_code: currency ?? config.currency,
                    value: amountValue,
                },
                // Hier passiert die Weiterleitung:
                // Wenn merchantEmail übergeben wird, leitet PayPal das Geld direkt dorthin weiter.
                ...(merchantEmail ? {
                    payee: {
                        email_address: merchantEmail,
                    },
                } : {}),
            },
        ],
        application_context: {
            brand_name: brandName,
            locale: "de-DE",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: returnUrl,
            cancel_url: cancelUrl,
        },
    };

    const data = await paypalRequest("/v2/checkout/orders", {
        method: "POST",
        body: JSON.stringify(payload),
    });

    const approvalUrl = data.links?.find((link) => link.rel === "approve")?.href;

    return {
        orderId: data.id,
        approvalUrl,
        raw: data,
    };
}

export async function capturePayPalOrder(orderId) {
    return paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        body: "{}",
    });
}

export async function refundPayPalCapture(captureId, amount, note_to_payer, options = {}) {
    const config = getPayPalConfig();
    const refundAmount = Number(amount);

    if (!captureId) {
        throw new Error("PayPal capture id is required for refunds.");
    }

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
        throw new Error("Refund amount must be greater than zero.");
    }

    const payload = {
        amount: {
            value: refundAmount.toFixed(2),
            currency_code: config.currency,
        },
        note_to_payer: note_to_payer || "Die Rückerstattung wurde angestoßen.",
    };

    payload.note_to_payer = String(payload.note_to_payer).slice(0, 255);

    return paypalRequest(`/v2/payments/captures/${captureId}/refund`, {
        method: "POST",
        headers: options.requestId
            ? {
                  "PayPal-Request-Id": String(options.requestId).slice(0, 108),
              }
            : {},
        body: JSON.stringify(payload),
    });
}
