import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { serializeBooking } from "@/lib/bookings";
import { buildBocaFgl, buildBocaFilename } from "@/lib/boca-tickets";
import { getBookingAccessWhere } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function matchesSearch(booking, search) {
    const q = toText(search);
    if (!q) return true;

    return [
        booking.id,
        booking.paymentReference,
        booking.purchaserName,
        booking.purchaserEmail,
        booking.ticketTypeName,
        booking.event?.title,
        booking.event?.location,
        booking.event?.city,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
}

export async function GET(request) {
    const user = await getCurrentUser();

    if (!user || user.role === "VISITOR") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || "all";
    const search = searchParams.get("search") || "";

    const rawBookings = await prisma.booking.findMany({
        where: {
            ...getBookingAccessWhere(user),
            status: "PAID",
            ...(eventId !== "all" ? { eventId } : {}),
        },
        orderBy: [{ event: { startDate: "asc" } }, { createdAt: "asc" }],
        include: {
            event: {
                select: {
                    id: true,
                    title: true,
                    location: true,
                    city: true,
                    startDate: true,
                },
            },
        },
    });

    const bookings = rawBookings.map(serializeBooking).filter((booking) => matchesSearch(booking, search));
    const body = buildBocaFgl(bookings);
    const filename = buildBocaFilename({ eventId, search });

    return new NextResponse(body, {
        headers: {
            "Content-Type": "text/plain; charset=us-ascii",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}
