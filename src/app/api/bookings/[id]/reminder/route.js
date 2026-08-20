import { getCurrentUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendPaymentReminderEmail } from "@/lib/mail";
import { getManualPaymentDetails, isManualPaymentMethod } from "@/lib/manual-payments";
import { getPaymentReminderState } from "@/lib/payment-reminders";

export async function POST(_request, { params }) {
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
                include: { organization: { include: { members: true } }, members: true },
            },
        },
    });

    if (!booking) {
        return Response.json({ error: "Buchung nicht gefunden." }, { status: 404 });
    }

    if (!canManageEvent(user, booking.event)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    if (booking.status !== "AWAITING_PAYMENT" || !isManualPaymentMethod(booking.paymentMethod)) {
        return Response.json(
            { error: "Für diese Buchung kann keine Erinnerung gesendet werden." },
            { status: 400 }
        );
    }

    const reminderState = getPaymentReminderState(booking);
    const reminderCount = Number(booking.paymentReminderCount || 0) + 1;
    const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: {
            paymentReminderCount: reminderCount,
            lastPaymentReminderAt: new Date(),
        },
        include: {
            event: {
                include: { organization: { include: { members: true } }, members: true },
            },
        },
    });

    const manualDetails = getManualPaymentDetails({
        booking: updated,
        event: booking.event,
    });

    await sendPaymentReminderEmail(updated, manualDetails, reminderState);

    return Response.json({
        ok: true,
        booking: {
            id: updated.id,
            paymentReminderCount: updated.paymentReminderCount,
            lastPaymentReminderAt: updated.lastPaymentReminderAt?.toISOString() ?? null,
        },
    });
}
