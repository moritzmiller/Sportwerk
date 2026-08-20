import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/env";

function pad(value) {
    return String(value).padStart(2, "0");
}

function toIcsDate(date) {
    return [
        date.getUTCFullYear(),
        pad(date.getUTCMonth() + 1),
        pad(date.getUTCDate()),
        "T",
        pad(date.getUTCHours()),
        pad(date.getUTCMinutes()),
        pad(date.getUTCSeconds()),
        "Z",
    ].join("");
}

function escapeText(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
}

export async function GET(request, { params }) {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);
    const origin = getAppUrl(request);

    if (Number.isNaN(id)) {
        return Response.json({ error: "Ungültige Event-ID." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
        where: { id },
        include: {
            owner: {
                select: {
                    name: true,
                    email: true,
                },
            },
        },
    });

    if (!event) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    const start = new Date(event.startDate);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GateKeeper//Event//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:gatekeeper-event-${event.id}@gatekeeper`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
        `SUMMARY:${escapeText(event.title)}`,
        `DESCRIPTION:${escapeText(event.description ?? event.title)}`,
        `LOCATION:${escapeText(`${event.location}, ${event.city}`)}`,
        `URL:${escapeText(`${origin}/events/${event.id}`)}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ];

    return new Response(lines.join("\r\n"), {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="gatekeeper-event-${event.id}.ics"`,
        },
    });
}
