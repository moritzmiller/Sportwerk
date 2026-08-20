import { getCurrentUser } from "@/lib/auth";
import { canCheckInEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeTicketInput, verifyTicketCode } from "@/lib/tickets";

function normalizeSource(value) {
    return String(value ?? "").trim() || "manual";
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function buildWarning(status, recentAttemptCount, duplicateCount) {
    if (status === "ALREADY_SCANNED") {
        return "Dieses Ticket wurde bereits eingecheckt.";
    }

    if (status === "INVALID") {
        return "Der QR-Code ist ungültig oder wurde manipuliert.";
    }

    if (status === "NOT_FOUND") {
        return "Zu diesem Code wurde kein Ticket gefunden.";
    }

    if (status === "FORBIDDEN") {
        return "Dieser Scan passt nicht zum aktuellen Veranstalter.";
    }

    if (duplicateCount > 0) {
        return `Auffällig: ${duplicateCount} weitere Scanversuche für dieses Ticket.`;
    }

    if (recentAttemptCount >= 3) {
        return `Auffällig: ${recentAttemptCount} Scanversuche in kurzer Zeit.`;
    }

    return null;
}

export async function POST(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const rawCode = String(resolvedParams.id || "").trim();
    const verified = verifyTicketCode(rawCode);

    if (verified.format === "signed" && !verified.ok) {
        const body = await request.json().catch(() => ({}));
        const source = normalizeSource(body.via);
        const userAgent = request.headers.get("user-agent") || null;
        const scan = await prisma.bookingScan.create({
            data: {
                rawInput: rawCode,
                status: "INVALID",
                warning: "Der QR-Code ist ungültig oder wurde manipuliert.",
                source,
                scannerId: user.id,
                scannerEmail: user.email,
                scannerName: user.name ?? null,
                details: {
                    userAgent,
                    verified: verified.format,
                },
            },
        });

        return Response.json(
            {
                error: "Ungultiger Ticket-Code.",
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            },
            { status: 400 }
        );
    }

    const ticketId = verified.ok ? verified.ticketId : null;
    const bookingId = verified.ok ? verified.bookingId : normalizeTicketInput(rawCode);

    if (!bookingId && !ticketId) {
        const body = await request.json().catch(() => ({}));
        const source = normalizeSource(body.via);
        const userAgent = request.headers.get("user-agent") || null;
        const scan = await prisma.bookingScan.create({
            data: {
                rawInput: rawCode,
                status: "INVALID",
                warning: "Der QR-Code ist ungültig oder wurde manipuliert.",
                source,
                scannerId: user.id,
                scannerEmail: user.email,
                scannerName: user.name ?? null,
                details: {
                    userAgent,
                    verified: verified.format,
                },
            },
        });

        return Response.json(
            {
                error: "Ungultige Buchungs-ID.",
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            },
            { status: 400 }
        );
    }

    const body = await request.json().catch(() => ({}));
    const source = normalizeSource(body.via);
    const userAgent = request.headers.get("user-agent") || null;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        if (ticketId) {
            const ticket = await tx.ticket.findUnique({
                where: { id: ticketId },
                include: {
                    booking: {
                        include: {
                            event: {
                                include: {
                                    organization: { include: { members: true } },
                                    members: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!ticket) {
                const scan = await tx.bookingScan.create({
                    data: {
                        ticketId,
                        rawInput: rawCode,
                        status: "NOT_FOUND",
                        warning: "Zu diesem Code wurde kein Ticket gefunden.",
                        source,
                        scannerId: user.id,
                        scannerEmail: user.email,
                        scannerName: user.name ?? null,
                        details: {
                            userAgent,
                            verified: verified.format,
                        },
                    },
                });

                return {
                    error: { status: 404, message: "Ticket nicht gefunden." },
                    scan: {
                        id: scan.id,
                        status: scan.status,
                        warning: scan.warning,
                        createdAt: scan.createdAt.toISOString(),
                    },
                };
            }

            const booking = ticket.booking;

            if (!canCheckInEvent(user, booking.event)) {
                const scan = await tx.bookingScan.create({
                    data: {
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        eventId: booking.eventId,
                        rawInput: rawCode,
                        status: "FORBIDDEN",
                        warning: "Dieser Scan passt nicht zum aktuellen Veranstalter.",
                        source,
                        scannerId: user.id,
                        scannerEmail: user.email,
                        scannerName: user.name ?? null,
                        details: {
                            userAgent,
                            verified: verified.format,
                            eventOwnerId: booking.event.ownerId,
                        },
                    },
                });

                return {
                    error: { status: 403, message: "Keine Berechtigung." },
                    scan: {
                        id: scan.id,
                        status: scan.status,
                        warning: scan.warning,
                        createdAt: scan.createdAt.toISOString(),
                    },
                };
            }

            if (booking.status !== "PAID" || ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
                const scan = await tx.bookingScan.create({
                    data: {
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        eventId: booking.eventId,
                        rawInput: rawCode,
                        status: "REJECTED",
                        warning: "Nur bezahlte, gueltige Tickets koennen eingecheckt werden.",
                        source,
                        scannerId: user.id,
                        scannerEmail: user.email,
                        scannerName: user.name ?? null,
                        details: {
                            userAgent,
                            bookingStatus: booking.status,
                            ticketStatus: ticket.status,
                            verified: verified.format,
                        },
                    },
                });

                return {
                    error: {
                        status: 400,
                        message: "Nur bezahlte, gueltige Tickets koennen eingecheckt werden.",
                    },
                    scan: {
                        id: scan.id,
                        status: scan.status,
                        warning: scan.warning,
                        createdAt: scan.createdAt.toISOString(),
                    },
                };
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
                const warning = buildWarning("ALREADY_SCANNED", recentAttemptCount, 0);
                const scan = await tx.bookingScan.create({
                    data: {
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        eventId: booking.eventId,
                        rawInput: rawCode,
                        status: "ALREADY_SCANNED",
                        warning,
                        source,
                        scannerId: user.id,
                        scannerEmail: user.email,
                        scannerName: user.name ?? null,
                        details: {
                            userAgent,
                            verified: verified.format,
                            checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
                            checkedInVia: ticket.checkedInVia ?? null,
                        },
                    },
                });

                return {
                    booking: {
                        id: booking.id,
                        eventId: booking.eventId,
                        ticketId: ticket.id,
                        quantity: 1,
                        checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
                        checkedInVia: ticket.checkedInVia ?? null,
                    },
                    alreadyCheckedIn: true,
                    scan: {
                        id: scan.id,
                        status: scan.status,
                        warning: scan.warning,
                        createdAt: scan.createdAt.toISOString(),
                    },
                };
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
                    checkedInById: user.id,
                    checkedInVia: source,
                },
            });

            if (updated.count === 0) {
                const scan = await tx.bookingScan.create({
                    data: {
                        ticketId: ticket.id,
                        bookingId: booking.id,
                        eventId: booking.eventId,
                        rawInput: rawCode,
                        status: "ALREADY_SCANNED",
                        warning: buildWarning("ALREADY_SCANNED", recentAttemptCount, 0),
                        source,
                        scannerId: user.id,
                        scannerEmail: user.email,
                        scannerName: user.name ?? null,
                        details: { userAgent, verified: verified.format, race: true },
                    },
                });

                return {
                    booking: {
                        id: booking.id,
                        eventId: booking.eventId,
                        ticketId: ticket.id,
                        quantity: 1,
                        checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
                        checkedInVia: ticket.checkedInVia ?? null,
                    },
                    alreadyCheckedIn: true,
                    scan: {
                        id: scan.id,
                        status: scan.status,
                        warning: scan.warning,
                        createdAt: scan.createdAt.toISOString(),
                    },
                };
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
                        checkedInById: user.id,
                        checkedInVia: source,
                    },
                });
            }

            const scan = await tx.bookingScan.create({
                data: {
                    ticketId: ticket.id,
                    bookingId: booking.id,
                    eventId: booking.eventId,
                    rawInput: rawCode,
                    status: "SCANNED",
                    warning: null,
                    source,
                    scannerId: user.id,
                    scannerEmail: user.email,
                    scannerName: user.name ?? null,
                    details: {
                        userAgent,
                        verified: verified.format,
                    },
                },
            });

            await tx.eventAuditLog.create({
                data: {
                    eventId: booking.eventId,
                    actorId: user.id,
                    action: "ticket.checked_in",
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
                booking: {
                    id: booking.id,
                    eventId: booking.eventId,
                    ticketId: ticket.id,
                    quantity: 1,
                    checkedInAt: now.toISOString(),
                    checkedInVia: source,
                },
                alreadyCheckedIn: false,
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            };
        }

        const booking = await tx.booking.findUnique({
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
            const scan = await tx.bookingScan.create({
                data: {
                    bookingId,
                    rawInput: rawCode,
                    status: "NOT_FOUND",
                    warning: "Zu diesem Code wurde kein Ticket gefunden.",
                    source,
                    scannerId: user.id,
                    scannerEmail: user.email,
                    scannerName: user.name ?? null,
                    details: {
                        userAgent,
                        verified: verified.format,
                    },
                },
            });

            return {
                error: { status: 404, message: "Buchung nicht gefunden." },
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            };
        }

        if (!canCheckInEvent(user, booking.event)) {
            const scan = await tx.bookingScan.create({
                data: {
                    bookingId: booking.id,
                    eventId: booking.eventId,
                    rawInput: rawCode,
                    status: "FORBIDDEN",
                    warning: "Dieser Scan passt nicht zum aktuellen Veranstalter.",
                    source,
                    scannerId: user.id,
                    scannerEmail: user.email,
                    scannerName: user.name ?? null,
                    details: {
                        userAgent,
                        verified: verified.format,
                        eventOwnerId: booking.event.ownerId,
                    },
                },
            });

            return {
                error: { status: 403, message: "Keine Berechtigung." },
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            };
        }

        if (booking.status !== "PAID") {
            const scan = await tx.bookingScan.create({
                data: {
                    bookingId: booking.id,
                    eventId: booking.eventId,
                    rawInput: rawCode,
                    status: "REJECTED",
                    warning: "Nur bezahlte Tickets können eingecheckt werden.",
                    source,
                    scannerId: user.id,
                    scannerEmail: user.email,
                    scannerName: user.name ?? null,
                    details: {
                        userAgent,
                        bookingStatus: booking.status,
                        verified: verified.format,
                    },
                },
            });

            return {
                error: {
                    status: 400,
                    message: "Nur bezahlte Tickets können eingecheckt werden.",
                },
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            };
        }

        const recentAttemptCount = await tx.bookingScan.count({
            where: {
                bookingId: booking.id,
                createdAt: {
                    gte: new Date(now.getTime() - 10 * 60 * 1000),
                },
            },
        });

        const duplicateCount = await tx.bookingScan.count({
            where: {
                bookingId: booking.id,
                status: {
                    in: ["ALREADY_SCANNED", "REJECTED", "INVALID", "NOT_FOUND", "FORBIDDEN"],
                },
            },
        });

        if (booking.checkedInAt) {
            const warning = buildWarning("ALREADY_SCANNED", recentAttemptCount, duplicateCount);
            const scan = await tx.bookingScan.create({
                data: {
                    bookingId: booking.id,
                    eventId: booking.eventId,
                    rawInput: rawCode,
                    status: "ALREADY_SCANNED",
                    warning,
                    source,
                    scannerId: user.id,
                    scannerEmail: user.email,
                    scannerName: user.name ?? null,
                    details: {
                        userAgent,
                        verified: verified.format,
                        checkedInAt: booking.checkedInAt.toISOString(),
                        checkedInVia: booking.checkedInVia ?? null,
                    },
                },
            });

            return {
                booking: {
                    id: booking.id,
                    eventId: booking.eventId,
                    quantity: booking.quantity,
                    checkedInAt: booking.checkedInAt.toISOString(),
                    checkedInVia: booking.checkedInVia ?? null,
                },
                alreadyCheckedIn: true,
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            };
        }

        const updated = await tx.booking.updateMany({
            where: {
                id: booking.id,
                checkedInAt: null,
            },
            data: {
                checkedInAt: new Date(),
                checkedInById: user.id,
                checkedInVia: source,
            },
        });

        if (updated.count === 0) {
            const current = await tx.booking.findUnique({
                where: { id: booking.id },
            });

            const warning = buildWarning("ALREADY_SCANNED", recentAttemptCount, duplicateCount);
            const scan = await tx.bookingScan.create({
                data: {
                    bookingId: booking.id,
                    eventId: booking.eventId,
                    rawInput: rawCode,
                    status: "ALREADY_SCANNED",
                    warning,
                    source,
                    scannerId: user.id,
                    scannerEmail: user.email,
                    scannerName: user.name ?? null,
                    details: {
                        userAgent,
                        verified: verified.format,
                        race: true,
                    },
                },
            });

            if (!current) {
                return {
                    error: { status: 404, message: "Buchung nicht gefunden." },
                    scan: {
                        id: scan.id,
                        status: scan.status,
                        warning: scan.warning,
                        createdAt: scan.createdAt.toISOString(),
                    },
                };
            }

            return {
                booking: {
                    id: current.id,
                    eventId: current.eventId,
                    quantity: current.quantity,
                    checkedInAt: current.checkedInAt?.toISOString() ?? null,
                    checkedInVia: current.checkedInVia ?? null,
                },
                alreadyCheckedIn: true,
                scan: {
                    id: scan.id,
                    status: scan.status,
                    warning: scan.warning,
                    createdAt: scan.createdAt.toISOString(),
                },
            };
        }

        const finalBooking = await tx.booking.findUnique({
            where: { id: booking.id },
        });

        const warning = buildWarning("SCANNED", recentAttemptCount, duplicateCount);
        const scan = await tx.bookingScan.create({
            data: {
                bookingId: booking.id,
                eventId: booking.eventId,
                rawInput: rawCode,
                status: "SCANNED",
                warning,
                source,
                scannerId: user.id,
                scannerEmail: user.email,
                scannerName: user.name ?? null,
                details: {
                    userAgent,
                    verified: verified.format,
                },
            },
        });

        await tx.eventAuditLog.create({
            data: {
                eventId: booking.eventId,
                actorId: user.id,
                action: "booking.checked_in",
                details: {
                    bookingId: finalBooking.id,
                    purchaserEmail: finalBooking.purchaserEmail,
                    via: source,
                    scanId: scan.id,
                },
            },
        });

        return {
            booking: {
                id: finalBooking.id,
                eventId: finalBooking.eventId,
                quantity: finalBooking.quantity,
                checkedInAt: finalBooking.checkedInAt?.toISOString() ?? null,
                checkedInVia: finalBooking.checkedInVia ?? null,
            },
            alreadyCheckedIn: false,
            scan: {
                id: scan.id,
                status: scan.status,
                warning: scan.warning,
                createdAt: scan.createdAt.toISOString(),
            },
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
        alreadyCheckedIn: Boolean(result.alreadyCheckedIn),
        booking: result.booking,
        scan: result.scan,
    });
}
