import { getCurrentUser } from "@/lib/auth";
import { sendPaymentCancellationEmail } from "@/lib/mail";
import { getManualPaymentDetails } from "@/lib/manual-payments";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { refundPayPalCapture } from "@/lib/paypal";
import { refundStripePaymentIntent } from "@/lib/stripe";
import { markBookingRefundedAndRelease } from "@/lib/payment-state";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function normalizeRefundReason(value) {
    const reason = String(value ?? "").trim();
    return (reason || "Refund requested").slice(0, 500);
}

function mergeRefundPayload(previousPayload, refundPayload) {
    return {
        previous: previousPayload ?? null,
        refund: refundPayload ?? null,
    };
}

export async function POST(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const bookingId = String(resolvedParams.id || "").trim();

    if (!bookingId) {
        return Response.json({ error: "Ungultige Buchungs-ID." }, { status: 400 });
    }

    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
            event: {
                include: {
                    organization: { include: { members: true } },
                    members: true,
                },
            },
        },
    });

    if (!booking) {
        return Response.json({ error: "Buchung nicht gefunden." }, { status: 404 });
    }

    if (booking.status === "REFUNDED") {
        return Response.json({
            ok: true,
            alreadyProcessed: true,
            booking: {
                id: booking.id,
                status: booking.status,
                paymentCancellationReason: booking.paymentCancellationReason,
            },
        });
    }

    if (booking.status !== "PAID") {
        return Response.json({ error: "Nur bezahlte Buchungen können erstattet werden." }, { status: 400 });
    }

    if (!canManageEvent(user, booking.event)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const reason = normalizeRefundReason(body.reason);

    let providerPayload = null;
    if (booking.paymentMethod === "PAYPAL") {
        if (!booking.paypalCaptureId) {
            return Response.json(
                { error: "PayPal-Capture fehlt. Die Rueckerstattung kann nicht sicher ausgefuehrt werden." },
                { status: 409 }
            );
        }

        try {
            providerPayload = await refundPayPalCapture(
                booking.paypalCaptureId,
                booking.totalAmount,
                reason,
                {
                    requestId: `gatekeeper-refund-${booking.id}`,
                }
            );
        } catch (error) {
            return Response.json(
                { error: error?.message ?? "Rückerstattung fehlgeschlagen." },
                { status: 502 }
            );
        }
    }

    if (booking.paymentMethod === "STRIPE") {
        if (!booking.stripePaymentIntentId) {
            return Response.json(
                { error: "Stripe-PaymentIntent fehlt. Die Rueckerstattung kann nicht sicher ausgefuehrt werden." },
                { status: 409 }
            );
        }

        try {
            providerPayload = await refundStripePaymentIntent(
                booking.stripePaymentIntentId,
                booking.totalAmount
            );
        } catch (error) {
            return Response.json(
                { error: error?.message ?? "Rueckerstattung fehlgeschlagen." },
                { status: 502 }
            );
        }
    }

    const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({
            where: { id: booking.id },
        });

        if (current) {
            await markBookingRefundedAndRelease(tx, current, {
                paymentCancelledAt: new Date(),
                paymentCancellationReason: reason,
                paypalStatus:
                    booking.paymentMethod === "PAYPAL"
                        ? providerPayload?.status ?? current.paypalStatus
                        : current.paypalStatus,
                stripeStatus:
                    booking.paymentMethod === "STRIPE"
                        ? providerPayload?.status ?? current.stripeStatus
                        : current.stripeStatus,
                providerPayload: mergeRefundPayload(current.providerPayload, providerPayload),
            });
        }

        return tx.booking.findUnique({
            where: { id: booking.id },
        });
    });

    if (!updated || updated.status !== "REFUNDED") {
        return Response.json(
            { error: "Diese Buchung wurde bereits anderweitig verarbeitet." },
            { status: 409 }
        );
    }

    await prisma.eventAuditLog.create({
        data: {
            eventId: booking.eventId,
            actorId: user.id,
            action: "booking.refunded",
            details: {
                bookingId: updated.id,
                reason,
                paymentMethod: updated.paymentMethod,
            },
        },
    });

    const paymentDetails = getManualPaymentDetails({
        booking: updated,
        event: booking.event,
    });
    sendPaymentCancellationEmail(updated, paymentDetails, reason).catch((error) => {
        console.error("[Refund] Cancellation mail failed:", error);
    });

    return Response.json({
        ok: true,
        booking: {
            id: updated.id,
            status: updated.status,
            paymentCancellationReason: updated.paymentCancellationReason,
        },
    });
}
