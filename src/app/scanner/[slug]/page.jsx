import { notFound } from "next/navigation";

import EventScanner from "@/components/EventScanner";
import { prisma } from "@/lib/prisma";
import { verifyScannerToken } from "@/lib/scanner-links";

export const dynamic = "force-dynamic";

function parseEventId(slug) {
    const match = String(slug ?? "").match(/^event-(\d+)$/);
    return match ? Number(match[1]) : null;
}

function serializeTicket(booking) {
    return {
        id: booking.id,
        purchaserName: booking.purchaserName,
        purchaserEmail: booking.purchaserEmail,
        quantity: booking.quantity,
        scanned: Boolean(booking.checkedInAt),
        checkedInAt: booking.checkedInAt?.toISOString() ?? null,
    };
}

export default async function ScannerPage({ params, searchParams }) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const eventId = parseEventId(resolvedParams.slug);
    const token = String(resolvedSearchParams.token ?? "");

    if (!eventId || !(await verifyScannerToken(token, eventId))) {
        notFound();
    }

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: {
            id: true,
            title: true,
            location: true,
            city: true,
            startDate: true,
            status: true,
            bookings: {
                where: { status: "PAID" },
                orderBy: [{ checkedInAt: "asc" }, { createdAt: "asc" }],
                select: {
                    id: true,
                    purchaserName: true,
                    purchaserEmail: true,
                    quantity: true,
                    checkedInAt: true,
                },
            },
        },
    });

    if (!event || event.status === "CANCELLED") {
        notFound();
    }

    return (
        <EventScanner
            token={token}
            event={{
                id: event.id,
                title: event.title,
                location: event.location,
                city: event.city,
                startDate: event.startDate.toISOString(),
            }}
            initialTickets={event.bookings.map(serializeTicket)}
        />
    );
}
