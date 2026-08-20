import { getCurrentUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendPaymentCancellationEmail, sendTicketEmail } from "@/lib/mail";
import { getManualPaymentDetails } from "@/lib/manual-payments";
import {
    cancelBookingAndRelease,
    markBookingPaid,
} from "@/lib/payment-state";

function normalizeStatus(value) {
    const upper = String(value ?? "").trim().toUpperCase();
    if (upper === "PAID" || upper === "CANCELLED") return upper;
    return null;
}

export async function PATCH(request, { params }) {
    const user = await getCurrentUser();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const bookingId = String(resolvedParams.id || "").trim();

    if (!bookingId) {
        return Response.json({ error: "Ungültige Buchungs-ID." }, { status: 400 });
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

    if (!canManageEvent(user, booking.event)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const status = normalizeStatus(body.status);

    if (!status) {
        return Response.json({ error: "Ungültiger Status." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.booking.findUnique({
            where: { id: booking.id },
        });

        if (status === "PAID" && current) {
            await markBookingPaid(tx, current, {
                paidAt: current.paidAt ?? new Date(),
                paypalStatus:
                    current.paymentProvider === "PAYPAL"
                        ? current.paypalStatus ?? "COMPLETED"
                        : current.paypalStatus,
            });
        } else if (current) {
            await cancelBookingAndRelease(tx, current, {
                paypalStatus: "CANCELLED_BY_USER",
                paymentCancelledAt: new Date(),
                paymentCancellationReason: "Manuell storniert.",
            });
        }

        return tx.booking.findUnique({
            where: { id: booking.id },
            include: {
                event: true,
            },
        });
    });

    if (status === "PAID") {
        sendTicketEmail(updated).catch((error) => {
            console.error("[Booking status] Ticket mail failed:", error);
        });
    } else {
        const paymentDetails = getManualPaymentDetails({
            booking: updated,
            event: booking.event,
        });

        sendPaymentCancellationEmail(
            updated,
            paymentDetails,
            updated.paymentCancellationReason || "Manuell storniert."
        ).catch((error) => {
            console.error("[Booking status] Cancellation mail failed:", error);
        });
    }

    return Response.json({
        ok: true,
        booking: {
            id: updated.id,
            status: updated.status,
            paidAt: updated.paidAt ? updated.paidAt.toISOString() : null,
        },
    });
}
