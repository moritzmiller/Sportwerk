import Stripe from "stripe";
import { getStripeConfig } from "./env.js";

let stripeClient = null;

function getStripeClient() {
    const config = getStripeConfig();

    if (!config.enabled || !config.secretKey) {
        throw new Error("Stripe is not configured.");
    }

    if (!stripeClient) {
        stripeClient = new Stripe(config.secretKey, {
            apiVersion: "2025-12-17.clover",
        });
    }

    return stripeClient;
}

function toCents(amount) {
    return Math.round((Number(amount) || 0) * 100);
}

function appendStripeSessionPlaceholder(url) {
    const separator = String(url).includes("?") ? "&" : "?";
    return `${url}${separator}stripeSessionId={CHECKOUT_SESSION_ID}`;
}

function normalizeSession(session) {
    const paymentIntentId =
        typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

    return {
        id: session.id,
        url: session.url,
        sessionId: session.id,
        checkoutUrl: session.url,
        paymentIntentId,
        status: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        raw: session,
    };
}

export function isStripeConfigured() {
    return getStripeConfig().enabled;
}

export async function createStripeCheckoutSession(options) {
    if (options?.paymentId || options?.batchId || options?.amountCents != null) {
        return createErichStripeCheckoutSession(options);
    }

    return createBookingStripeCheckoutSession(options);
}

async function createErichStripeCheckoutSession({
    paymentId,
    batchId,
    eventTitle,
    description,
    amountCents,
    currency = "EUR",
    returnUrl,
    cancelUrl,
}) {
    if (!paymentId) throw new Error("paymentId is required.");
    if (!batchId) throw new Error("batchId is required.");
    if (!returnUrl || !cancelUrl) throw new Error("Stripe checkout URLs are required.");

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: String(currency || "EUR").toLowerCase(),
                    unit_amount: Number(amountCents),
                    product_data: {
                        name: eventTitle || "ERICH Registrierung",
                        description: description || "ERICH Registrierung",
                    },
                },
            },
        ],
        metadata: {
            provider: "STRIPE",
            paymentId,
            registrationBatchId: batchId,
        },
        payment_intent_data: {
            metadata: {
                provider: "STRIPE",
                paymentId,
                registrationBatchId: batchId,
            },
        },
        success_url: appendStripeSessionPlaceholder(returnUrl),
        cancel_url: cancelUrl,
    });

    return normalizeSession(session);
}

async function createBookingStripeCheckoutSession({
    bookingId,
    eventTitle,
    unitAmount,
    quantity,
    totalAmount = null,
    customerEmail,
    successUrl,
    cancelUrl,
}) {
    const config = getStripeConfig();
    const stripe = getStripeClient();

    const normalizedQuantity = Math.max(1, Number(quantity) || 1);
    const checkoutUnitAmount =
        totalAmount === null || typeof totalAmount === "undefined"
            ? unitAmount
            : Number(totalAmount) / normalizedQuantity;

    const session = await stripe.checkout.sessions.create(
        {
            mode: "payment",
            customer_email: customerEmail || undefined,
            client_reference_id: String(bookingId),
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: [
                {
                    quantity: normalizedQuantity,
                    price_data: {
                        currency: config.currency.toLowerCase(),
                        product_data: {
                            name: eventTitle,
                        },
                        unit_amount: toCents(checkoutUnitAmount),
                    },
                },
            ],
            metadata: {
                bookingId: String(bookingId),
            },
            payment_intent_data: {
                metadata: {
                    bookingId: String(bookingId),
                },
            },
        },
        {
            idempotencyKey: `gatekeeper-stripe-checkout-${bookingId}`,
        }
    );

    return normalizeSession(session);
}

export async function retrieveStripeCheckoutSession(sessionId) {
    if (!sessionId) throw new Error("Stripe checkout session id is required.");

    const session = await getStripeClient().checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
    });

    return normalizeSession(session);
}

export async function refundStripePaymentIntent(
    paymentIntentId,
    amount,
    reason = "requested_by_customer"
) {
    if (!paymentIntentId) {
        throw new Error("Stripe payment intent is required for refunds.");
    }

    return getStripeClient().refunds.create(
        {
            payment_intent: paymentIntentId,
            amount: toCents(amount),
            reason,
        },
        {
            idempotencyKey: `gatekeeper-stripe-refund-${paymentIntentId}`,
        }
    );
}

export function constructStripeWebhookEvent(rawBody, signature) {
    const config = getStripeConfig();
    if (!config.webhookEnabled || !config.webhookSecret) {
        throw new Error("Stripe webhook verification is not configured.");
    }

    return getStripeClient().webhooks.constructEvent(rawBody, signature, config.webhookSecret);
}

export function verifyStripeWebhookSignature({ bodyText, signature }) {
    return constructStripeWebhookEvent(bodyText, signature);
}
