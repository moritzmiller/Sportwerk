import { getCurrentUser } from "@/lib/auth";
import { buildCheckinScansCsv } from "@/lib/checkin-scans";
import { prisma } from "@/lib/prisma";
import { getEventAccessWhere } from "@/lib/permissions";

function normalizeEventId(value) {
    const parsed = Number(String(value ?? "").trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    if (user.role === "VISITOR") {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const url = new URL(request.url);
    const eventId = normalizeEventId(url.searchParams.get("eventId"));

    const where = {
        ...(eventId ? { eventId } : {}),
        ...(user.role === "ADMIN"
            ? {}
            : {
                  event: getEventAccessWhere(user),
              }),
    };

    const scans = await prisma.bookingScan.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            booking: {
                select: {
                    id: true,
                    purchaserName: true,
                    purchaserEmail: true,
                    quantity: true,
                    eventId: true,
                },
            },
            ticket: {
                select: {
                    id: true,
                    holderName: true,
                    ticketTypeName: true,
                    ticketNumber: true,
                },
            },
            event: {
                select: {
                    id: true,
                    title: true,
                    location: true,
                    city: true,
                },
            },
            scanner: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            },
        },
    });

    const csv = buildCheckinScansCsv(scans);

    return new Response(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="gatekeeper-checkin-scans.csv"`,
        },
    });
}
