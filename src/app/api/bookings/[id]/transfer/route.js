import { getCurrentUser } from "@/lib/auth";
import { sendTicketEmail } from "@/lib/mail";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
    isValidEmail,
    normalizeEmail,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

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

    if (!canManageEvent(user, booking.event)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const transferToName = normalizeSafeText(body.transferToName, { maxLength: 120 });
    const transferToEmail = normalizeEmail(body.transferToEmail);

    if (!transferToName || !isValidEmail(transferToEmail)) {
        return Response.json(
            { error: "Name und E-Mail für die Ticketübergabe sind erforderlich." },
            { status: 400 }
        );
    }

    const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: {
            transferToName,
            transferToEmail,
            purchaserName: transferToName,
            purchaserEmail: transferToEmail,
            attendeeId: booking.attendeeId ?? null,
        },
    });

    if (updated.status === "PAID") {
        sendTicketEmail(updated).catch((error) => {
            console.error("[Transfer] Ticket mail failed:", error);
        });
    }

    await prisma.eventAuditLog.create({
        data: {
            eventId: booking.eventId,
            actorId: user.id,
            action: "booking.transferred",
            details: {
                bookingId: booking.id,
                transferToName,
                transferToEmail,
            },
        },
    });

    return Response.json({
        ok: true,
        booking: {
            id: updated.id,
            transferToName: updated.transferToName,
            transferToEmail: updated.transferToEmail,
        },
    });
}
