import { prisma } from "@/lib/prisma";
import { capturePayPalOrder } from "@/lib/paypal";
import {
    markBookingFailedAndRelease,
    markBookingPaid,
} from "@/lib/payment-state";

export async function POST(request, { params }) {
    // Falls du Next.js 15+ nutzt, ist params eine Promise und muss "awaited" werden.
    // Falls du Next.js 13/14 nutzt, schadet das "await" nicht, wenn params synchron ist.
    const resolvedParams = await params;
    const bookingId = String(resolvedParams.id || "").trim();

    if (!bookingId) {
        return Response.json({ error: "Ungültige Buchungs-ID." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = body.orderId || body.token;

    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
            event: true,
        },
    });

    if (!booking) {
        return Response.json({ error: "Booking nicht gefunden." }, { status: 404 });
    }

    if (booking.status === "PAID") {
        return Response.json({
            ok: true,
            bookingId: booking.id,
            status: booking.status,
        });
    }

    if (booking.status !== "AWAITING_PAYMENT") {
        return Response.json(
            { error: "Diese Buchung kann nicht mehr bezahlt werden." },
            { status: 409 }
        );
    }

    const paypalOrderId = orderId || booking.paypalOrderId;

    if (!paypalOrderId) {
        return Response.json(
            { error: "PayPal-Order fehlt." },
            { status: 400 }
        );
    }

    if (booking.paypalOrderId && booking.paypalOrderId !== paypalOrderId) {
        return Response.json(
            { error: "PayPal-Order passt nicht zur Buchung." },
            { status: 400 }
        );
    }

    try {
        const result = await capturePayPalOrder(paypalOrderId);

        // Manche SDKs mappen die API-Antwort direkt. Sicherstellen, dass das Objekt existiert:
        const capture = result?.purchase_units?.[0]?.payments?.captures?.[0];

        const paidUpdate = await markBookingPaid(prisma, booking, {
                paypalOrderId: paypalOrderId,
                paypalCaptureId: capture?.id ?? booking.paypalCaptureId,
                paypalStatus: result?.status ?? "COMPLETED",
                providerPayload: result,
        });

        if (paidUpdate.action !== "paid") {
            return Response.json(
                { error: "Diese Buchung wurde bereits verarbeitet." },
                { status: 409 }
            );
        }

        const updated = await prisma.booking.findUnique({
            where: { id: booking.id },
            include: { event: true },
        });

        return Response.json({
            ok: true,
            booking: {
                id: updated.id,
                status: updated.status,
                orderId: updated.paypalOrderId,
                captureId: updated.paypalCaptureId,
                quantity: updated.quantity,
                totalAmount: updated.totalAmount,
                event: {
                    id: updated.event.id,
                    title: updated.event.title,
                    location: updated.event.location,
                    city: updated.event.city,
                    startDate: updated.event.startDate.toISOString(),
                },
            },
        });
    } catch (error) {
        await prisma.$transaction(async (tx) => {
            const current = await tx.booking.findUnique({
                where: { id: booking.id },
            });

            if (current) {
                await markBookingFailedAndRelease(tx, current, {
                    paypalOrderId: paypalOrderId,
                    providerPayload: {
                        error: error?.message ?? "Capture failed",
                    },
                });
            }
        });

        return Response.json(
            { error: error?.message ?? "PayPal-Zahlung konnte nicht abgeschlossen werden." },
            { status: 502 }
        );
    }
}
