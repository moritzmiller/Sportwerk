import { prisma } from "@/lib/prisma";
import { serializeScannerBooking } from "@/lib/scanner-privacy";
import { verifyScannerToken } from "@/lib/scanner-links";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    getClientIp,
    rateLimitResponse,
} from "@/lib/persistent-rate-limit";
import {
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { normalizeTicketInput, verifyTicketCode } from "@/lib/tickets";

function normalizeSource(value) {
    return String(value ?? "").trim() || "scanner-link";
}

function buildWarning(status) {
    if (status === "ALREADY_SCANNED") return "Bereits gescannt";
    if (status === "INVALID") return "Ungültiger QR-Code";
    if (status === "NOT_FOUND") return "Ticket nicht gefunden";
    if (status === "FORBIDDEN") return "Ticket gehört zu einem anderen Event";
    if (status === "REJECTED") return "Ticket ist nicht bezahlt";
    return null;
}

function scanPayload(scan) {
    return {
        id: scan.id,
        status: scan.status,
        warning: scan.warning,
        createdAt: scan.createdAt.toISOString(),
    };
}

async function createRejectedScan(tx, data, response) {
    const scan = await tx.bookingScan.create({ data });
    return {
        error: response,
        scan: scanPayload(scan),
    };
}

export async function POST(request, { params }) {
    const resolvedParams = await params;
    const eventId = Number(resolvedParams.eventId);
    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const token = String(body.token ?? request.headers.get("x-gatekeeper-scanner-token") ?? "");
    const rawCode = String(body.code ?? "").trim();
    const source = normalizeSource(body.via);
    const userAgent = request.headers.get("user-agent") || null;

    if (!Number.isInteger(eventId)) {
        return Response.json({ error: "Ungültige Event-ID." }, { status: 400 });
    }

    const rateLimit = await checkPersistentRateLimit({
        key: buildRateLimitKey("scanner:validate", getClientIp(request), eventId, token || "missing"),
        limit: 180,
        windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return rateLimitResponse(
            "Zu viele Scan-Anfragen. Bitte kurz warten und dann weiter scannen.",
            rateLimit
        );
    }

    if (!(await verifyScannerToken(token, eventId, { markUsed: true, request }))) {
        return Response.json({ error: "Scanner-Link ist ungültig." }, { status: 403 });
    }

    const verified = verifyTicketCode(rawCode);
    const ticketId = verified.ok ? verified.ticketId : null;
    const bookingId = verified.ok ? verified.bookingId : normalizeTicketInput(rawCode);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        if (verified.format === "signed" && !verified.ok) {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    rawInput: rawCode,
                    status: "INVALID",
                    warning: buildWarning("INVALID"),
                    source,
                    details: { userAgent, verified: verified.format },
                },
                { status: 400, message: "Ungültiger QR-Code." }
            );
        }

        if (!bookingId && !ticketId) {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    rawInput: rawCode,
                    status: "INVALID",
                    warning: buildWarning("INVALID"),
                    source,
                    details: { userAgent, verified: verified.format },
                },
                { status: 400, message: "Ungültige Ticket-ID." }
            );
        }

        if (ticketId) {
            const ticket = await tx.ticket.findUnique({
                where: { id: ticketId },
                include: {
                    booking: true,
                },
            });

            if (!ticket) {
                return createRejectedScan(
                    tx,
                    {
                        eventId,
                        ticketId,
                        rawInput: rawCode,
                        status: "NOT_FOUND",
                        warning: buildWarning("NOT_FOUND"),
                        source,
                        details: { userAgent, verified: verified.format },
                    },
                    { status: 404, message: "Ticket nicht gefunden." }
                );
            }

            const booking = ticket.booking;

            if (booking.eventId !== eventId) {
                return createRejectedScan(
                    tx,
                    {
                        eventId,
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        rawInput: rawCode,
                        status: "FORBIDDEN",
                        warning: buildWarning("FORBIDDEN"),
                        source,
                        details: {
                            userAgent,
                            verified: verified.format,
                            bookingEventId: booking.eventId,
                        },
                    },
                    { status: 403, message: "Ticket gehoert zu einem anderen Event." }
                );
            }

            if (booking.status !== "PAID" || ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
                return createRejectedScan(
                    tx,
                    {
                        eventId,
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        rawInput: rawCode,
                        status: "REJECTED",
                        warning: buildWarning("REJECTED"),
                        source,
                        details: {
                            userAgent,
                            verified: verified.format,
                            bookingStatus: booking.status,
                            ticketStatus: ticket.status,
                        },
                    },
                    { status: 400, message: "Ticket ist nicht bezahlt." }
                );
            }

            const recentAttemptCount = await tx.bookingScan.count({
                where: {
                    ticketId: ticket.id,
                    createdAt: {
                        gte: new Date(now.getTime() - 10 * 60 * 1000),
                    },
                },
            });

            if (ticket.status === "CHECKED_IN" || ticket.checkedInAt) {
                return createRejectedScan(
                    tx,
                    {
                        eventId,
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        rawInput: rawCode,
                        status: "ALREADY_SCANNED",
                        warning: buildWarning("ALREADY_SCANNED"),
                        source,
                        details: {
                            userAgent,
                            verified: verified.format,
                            checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
                            checkedInVia: ticket.checkedInVia ?? null,
                            recentAttemptCount,
                        },
                    },
                    { status: 409, message: "Bereits gescannt." }
                );
            }

            const updated = await tx.ticket.updateMany({
                where: {
                    id: ticket.id,
                    status: "VALID",
                    checkedInAt: null,
                },
                data: {
                    status: "CHECKED_IN",
                    checkedInAt: now,
                    checkedInVia: source,
                },
            });

            if (updated.count === 0) {
                return createRejectedScan(
                    tx,
                    {
                        eventId,
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        rawInput: rawCode,
                        status: "ALREADY_SCANNED",
                        warning: buildWarning("ALREADY_SCANNED"),
                        source,
                        details: { userAgent, verified: verified.format, race: true },
                    },
                    { status: 409, message: "Bereits gescannt." }
                );
            }

            const remainingValidTickets = await tx.ticket.count({
                where: {
                    bookingId: booking.id,
                    status: "VALID",
                },
            });

            if (remainingValidTickets === 0 && !booking.checkedInAt) {
                await tx.booking.updateMany({
                    where: {
                        id: booking.id,
                        checkedInAt: null,
                    },
                    data: {
                        checkedInAt: now,
                        checkedInVia: source,
                    },
                });
            }

            const scan = await tx.bookingScan.create({
                data: {
                    eventId,
                    ticketId: ticket.id,
                    bookingId: booking.id,
                    rawInput: rawCode,
                    status: "SCANNED",
                    warning: null,
                    source,
                    details: { userAgent, verified: verified.format, recentAttemptCount },
                },
            });

            await tx.eventAuditLog.create({
                data: {
                    eventId,
                    actorId: null,
                    action: "ticket.checked_in.scanner_link",
                    details: {
                        bookingId: booking.id,
                        ticketId: ticket.id,
                        purchaserEmail: booking.purchaserEmail,
                        via: source,
                        scanId: scan.id,
                    },
                },
            });

            return {
                booking: serializeScannerBooking(
                    {
                        ...booking,
                        ticketId: ticket.id,
                        checkedInAt: now,
                        checkedInVia: source,
                    },
                    { quantity: 1 }
                ),
                scan: scanPayload(scan),
            };
        }

        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: {
                event: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        if (!booking) {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    bookingId,
                    rawInput: rawCode,
                    status: "NOT_FOUND",
                    warning: buildWarning("NOT_FOUND"),
                    source,
                    details: { userAgent, verified: verified.format },
                },
                { status: 404, message: "Ticket nicht gefunden." }
            );
        }

        if (booking.eventId !== eventId) {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    bookingId: booking.id,
                    rawInput: rawCode,
                    status: "FORBIDDEN",
                    warning: buildWarning("FORBIDDEN"),
                    source,
                    details: {
                        userAgent,
                        verified: verified.format,
                        bookingEventId: booking.eventId,
                    },
                },
                { status: 403, message: "Ticket gehört zu einem anderen Event." }
            );
        }

        if (booking.status !== "PAID") {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    bookingId: booking.id,
                    rawInput: rawCode,
                    status: "REJECTED",
                    warning: buildWarning("REJECTED"),
                    source,
                    details: {
                        userAgent,
                        verified: verified.format,
                        bookingStatus: booking.status,
                    },
                },
                { status: 400, message: "Ticket ist nicht bezahlt." }
            );
        }

        const recentAttemptCount = await tx.bookingScan.count({
            where: {
                bookingId: booking.id,
                createdAt: {
                    gte: new Date(now.getTime() - 10 * 60 * 1000),
                },
            },
        });

        if (booking.checkedInAt) {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    bookingId: booking.id,
                    rawInput: rawCode,
                    status: "ALREADY_SCANNED",
                    warning: buildWarning("ALREADY_SCANNED"),
                    source,
                    details: {
                        userAgent,
                        verified: verified.format,
                        checkedInAt: booking.checkedInAt.toISOString(),
                        checkedInVia: booking.checkedInVia ?? null,
                        recentAttemptCount,
                    },
                },
                { status: 409, message: "Bereits gescannt." }
            );
        }

        const updated = await tx.booking.updateMany({
            where: {
                id: booking.id,
                checkedInAt: null,
            },
            data: {
                checkedInAt: now,
                checkedInVia: source,
            },
        });

        if (updated.count === 0) {
            return createRejectedScan(
                tx,
                {
                    eventId,
                    bookingId: booking.id,
                    rawInput: rawCode,
                    status: "ALREADY_SCANNED",
                    warning: buildWarning("ALREADY_SCANNED"),
                    source,
                    details: { userAgent, verified: verified.format, race: true },
                },
                { status: 409, message: "Bereits gescannt." }
            );
        }

        const finalBooking = await tx.booking.findUnique({
            where: { id: booking.id },
            select: {
                id: true,
                eventId: true,
                purchaserName: true,
                quantity: true,
                checkedInAt: true,
                checkedInVia: true,
            },
        });

        const scan = await tx.bookingScan.create({
            data: {
                eventId,
                bookingId: booking.id,
                rawInput: rawCode,
                status: "SCANNED",
                warning: null,
                source,
                details: { userAgent, verified: verified.format, recentAttemptCount },
            },
        });

        await tx.eventAuditLog.create({
            data: {
                eventId,
                actorId: null,
                action: "booking.checked_in.scanner_link",
                details: {
                    bookingId: booking.id,
                    purchaserEmail: finalBooking.purchaserEmail,
                    via: source,
                    scanId: scan.id,
                },
            },
        });

        return {
            booking: serializeScannerBooking(finalBooking),
            scan: scanPayload(scan),
        };
    });

    if (result.error) {
        return Response.json(
            {
                error: result.error.message,
                scan: result.scan ?? null,
            },
            { status: result.error.status }
        );
    }

    return Response.json({
        ok: true,
        booking: result.booking,
        scan: result.scan,
    });
}
