import { createBookingAccessToken } from "./booking-access.js";
import { sendManualPaymentEmail } from "./mail.js";
import { createPaymentReference, getManualPaymentDetails } from "./manual-payments.js";
import { isManualPaymentMethod } from "./payment-methods.js";
import { createPayPalOrder, isPayPalConfigured } from "./paypal.js";
import { markBookingFailedAndRelease, markBookingPaid } from "./payment-state.js";
import { createMollieAdapter, isMollieConfigured } from "./payments/mollie.js";
import { buildPaymentProviderRequest, eurosToCents } from "./payments/domain.js";
import { prisma } from "./prisma.js";
import { createStripeCheckoutSession, isStripeConfigured } from "./stripe.js";

export const CHECKOUT_CONTEXT_TYPES = Object.freeze({
    EVENT_BOOKING: "EVENT_BOOKING",
    LOCATION_RENTAL: "LOCATION_RENTAL",
});

export function createCheckoutAccessToken(checkout) {
    if (checkout.referenceType === "BOOKING") {
        return createBookingAccessToken(checkout.record);
    }

    throw new Error(`Unsupported checkout access token reference: ${checkout.referenceType}`);
}

export function buildCheckoutReturnUrl({
    returnPath,
    referenceId,
    referenceParamName = "bookingId",
    accessToken,
    extraParams = {},
}) {
    if (!returnPath) throw new Error("returnPath is required.");
    if (!referenceId) throw new Error("referenceId is required.");

    const params = new URLSearchParams({ [referenceParamName]: referenceId });
    if (accessToken) {
        params.set("accessToken", accessToken);
    }
    for (const [key, value] of Object.entries(extraParams)) {
        if (value !== null && typeof value !== "undefined") {
            params.set(key, value);
        }
    }

    return `${returnPath}?${params.toString()}`;
}

export function buildHostedCheckoutUrls({
    origin,
    returnPath,
    referenceId,
    referenceParamName = "bookingId",
    accessToken,
}) {
    const baseReturnUrl = `${origin}${buildCheckoutReturnUrl({
        returnPath,
        referenceId,
        referenceParamName,
        accessToken,
    })}`;
    return {
        returnUrl: baseReturnUrl,
        cancelUrl: `${origin}${buildCheckoutReturnUrl({
            returnPath,
            referenceId,
            referenceParamName,
            accessToken,
            extraParams: { cancelled: "1" },
        })}`,
        stripeSuccessUrl: `${baseReturnUrl}&stripe_session_id={CHECKOUT_SESSION_ID}`,
    };
}

async function failBookingAndReleaseReservation(booking, data) {
    return prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({
            where: { id: booking.id },
        });

        if (!current) return null;

        if (current.status === "AWAITING_PAYMENT") {
            await markBookingFailedAndRelease(tx, current, data);
            return tx.booking.findUnique({
                where: { id: current.id },
            });
        }

        return current;
    });
}

async function ensureBookingPaymentReference(booking) {
    if (booking.paymentReference) return booking;

    return prisma.booking.update({
        where: { id: booking.id },
        data: {
            paymentReference: createPaymentReference(booking.id),
        },
    });
}

function createJsonResult(payload) {
    return {
        response: Response.json(payload),
        payload,
    };
}

function jsonError(message, status = 400) {
    return {
        response: Response.json({ error: message }, { status }),
        payload: { error: message, status },
    };
}

export async function startEventBookingCheckoutPayment({
    request,
    booking,
    event,
    totals,
    paymentMethod,
    purchaserEmail,
}) {
    const checkout = {
        type: CHECKOUT_CONTEXT_TYPES.EVENT_BOOKING,
        referenceType: "BOOKING",
        referenceId: booking.id,
        record: await ensureBookingPaymentReference(booking),
    };
    const paymentBooking = checkout.record;
    const accessToken = createCheckoutAccessToken(checkout);
    const returnPath = `/events/${event.id}/checkout`;

    if (paymentMethod === "PAYPAL" && paymentBooking.paypalOrderId && paymentBooking.paypalApprovalUrl) {
        return createJsonResult({
            ok: true,
            bookingId: paymentBooking.id,
            accessToken,
            approvalUrl: paymentBooking.paypalApprovalUrl,
            orderId: paymentBooking.paypalOrderId,
            reused: true,
        });
    }

    if (
        paymentMethod === "STRIPE" &&
        paymentBooking.stripeCheckoutSessionId &&
        paymentBooking.stripeStatus === "open"
    ) {
        return createJsonResult({
            ok: true,
            bookingId: paymentBooking.id,
            accessToken,
            approvalUrl: paymentBooking.providerPayload?.url ?? null,
            sessionId: paymentBooking.stripeCheckoutSessionId,
            reused: true,
        });
    }

    if (
        paymentMethod === "MOLLIE_PAY_BY_BANK" &&
        paymentBooking.paymentProvider === "MOLLIE" &&
        paymentBooking.providerPayload?.checkoutUrl
    ) {
        return createJsonResult({
            ok: true,
            bookingId: paymentBooking.id,
            accessToken,
            approvalUrl: paymentBooking.providerPayload.checkoutUrl,
            paymentId: paymentBooking.providerPayload.paymentId ?? paymentBooking.providerPayload.id ?? null,
            reused: true,
        });
    }

    if (totals.totalAmount <= 0) {
        await markBookingPaid(prisma, paymentBooking, {
            paymentProvider: "FREE",
            paypalStatus: "NOT_REQUIRED",
            paidAt: new Date(),
        });

        const paidBooking = await prisma.booking.findUnique({
            where: { id: paymentBooking.id },
        });

        return createJsonResult({
            ok: true,
            bookingId: paidBooking.id,
            accessToken: createBookingAccessToken(paidBooking),
            approvalUrl: null,
            orderId: null,
            directComplete: true,
        });
    }

    if (isManualPaymentMethod(paymentMethod)) {
        const manualBooking = await prisma.booking.update({
            where: { id: paymentBooking.id },
            data: {
                paymentProvider: paymentMethod,
                paymentMethod,
                status: "AWAITING_PAYMENT",
            },
            include: {
                event: {
                    include: {
                        owner: {
                            select: {
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        const manualDetails = getManualPaymentDetails({
            booking: manualBooking,
            event,
        });

        sendManualPaymentEmail(manualBooking, manualDetails).catch((error) => {
            console.error("Manual payment mail error:", error);
        });

        return createJsonResult({
            ok: true,
            bookingId: manualBooking.id,
            accessToken: createBookingAccessToken(manualBooking),
            manualComplete: true,
            paymentMethod: manualBooking.paymentMethod,
            paymentReference: manualBooking.paymentReference,
        });
    }

    const origin = new URL(request.url).origin;
    const urls = buildHostedCheckoutUrls({
        origin,
        returnPath,
        referenceId: paymentBooking.id,
        accessToken,
    });

    if (paymentMethod === "STRIPE") {
        if (!isStripeConfigured()) {
            await failBookingAndReleaseReservation(paymentBooking, {
                providerPayload: {
                    error: "Stripe configuration is missing.",
                },
            });

            return jsonError("Stripe ist noch nicht konfiguriert. Bitte Backend-Umgebung setzen.", 503);
        }

        try {
            const stripeSession = await createStripeCheckoutSession({
                bookingId: paymentBooking.id,
                eventTitle: event.title,
                unitAmount: totals.unitPrice,
                quantity: totals.quantity,
                totalAmount: totals.totalAmount,
                customerEmail: purchaserEmail,
                successUrl: urls.stripeSuccessUrl,
                cancelUrl: urls.cancelUrl,
            });

            if (!stripeSession.id || !stripeSession.url) {
                throw new Error("Stripe checkout session did not return a checkout URL.");
            }

            await prisma.booking.update({
                where: { id: paymentBooking.id },
                data: {
                    stripeCheckoutSessionId: stripeSession.id,
                    stripePaymentIntentId: stripeSession.paymentIntentId,
                    stripeStatus: stripeSession.status ?? stripeSession.paymentStatus ?? "open",
                    providerPayload: stripeSession.raw,
                    paymentProvider: "STRIPE",
                },
            });

            return createJsonResult({
                ok: true,
                bookingId: paymentBooking.id,
                accessToken,
                approvalUrl: stripeSession.url,
                sessionId: stripeSession.id,
            });
        } catch (error) {
            await failBookingAndReleaseReservation(paymentBooking, {
                providerPayload: {
                    error: error?.message ?? "Stripe checkout failed",
                },
            });

            return jsonError(error?.message ?? "Stripe-Buchung konnte nicht vorbereitet werden.", 502);
        }
    }

    if (paymentMethod === "MOLLIE_PAY_BY_BANK") {
        if (!isMollieConfigured()) {
            await failBookingAndReleaseReservation(paymentBooking, {
                providerPayload: {
                    error: "Mollie configuration is missing.",
                },
            });

            return jsonError("Mollie ist noch nicht konfiguriert. Bitte Backend-Umgebung setzen.", 503);
        }

        try {
            const adapter = createMollieAdapter();
            const molliePayment = await adapter.createPayment(
                buildPaymentProviderRequest({
                    booking: paymentBooking,
                    referenceType: checkout.referenceType,
                    referenceId: checkout.referenceId,
                    provider: "MOLLIE",
                    method: paymentMethod,
                    amountCents: eurosToCents(totals.totalAmount),
                    returnUrl: urls.returnUrl,
                    cancelUrl: urls.cancelUrl,
                    metadata: {
                        description: event.title,
                    },
                    webhookUrl: `${origin}/api/payments/mollie/webhook`,
                })
            );

            if (!molliePayment.paymentId || !molliePayment.checkoutUrl) {
                throw new Error("Mollie payment did not return a checkout URL.");
            }

            await prisma.booking.update({
                where: { id: paymentBooking.id },
                data: {
                    providerPayload: molliePayment,
                    paymentProvider: "MOLLIE",
                },
            });

            return createJsonResult({
                ok: true,
                bookingId: paymentBooking.id,
                accessToken,
                approvalUrl: molliePayment.checkoutUrl,
                paymentId: molliePayment.paymentId,
            });
        } catch (error) {
            await failBookingAndReleaseReservation(paymentBooking, {
                providerPayload: {
                    error: error?.message ?? "Mollie payment failed",
                },
            });

            return jsonError(error?.message ?? "Mollie-Buchung konnte nicht vorbereitet werden.", 502);
        }
    }

    if (!isPayPalConfigured()) {
        await failBookingAndReleaseReservation(paymentBooking, {
            providerPayload: {
                error: "PayPal configuration is missing.",
            },
        });

        return jsonError("PayPal ist noch nicht konfiguriert. Bitte Backend-Umgebung setzen.", 503);
    }

    try {
        const paypalOrder = await createPayPalOrder({
            bookingId: paymentBooking.id,
            eventTitle: event.title,
            totalAmount: totals.totalAmount,
            returnUrl: urls.returnUrl,
            cancelUrl: urls.cancelUrl,
            merchantEmail: event.owner.paypalEmail,
        });

        if (!paypalOrder.orderId || !paypalOrder.approvalUrl) {
            throw new Error("PayPal order creation did not return an approval URL.");
        }

        await prisma.booking.update({
            where: { id: paymentBooking.id },
            data: {
                paypalOrderId: paypalOrder.orderId,
                paypalApprovalUrl: paypalOrder.approvalUrl,
                paypalStatus: "CREATED",
                providerPayload: paypalOrder.raw,
                paymentProvider: "PAYPAL",
            },
        });

        return createJsonResult({
            ok: true,
            bookingId: paymentBooking.id,
            accessToken,
            approvalUrl: paypalOrder.approvalUrl,
            orderId: paypalOrder.orderId,
        });
    } catch (error) {
        await failBookingAndReleaseReservation(paymentBooking, {
            providerPayload: {
                error: error?.message ?? "PayPal order failed",
            },
        });

        return jsonError(error?.message ?? "PayPal-Buchung konnte nicht vorbereitet werden.", 502);
    }
}
