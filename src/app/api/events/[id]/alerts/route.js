import { getCurrentUser } from "@/lib/auth";
import { CATEGORY_MAP } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { upsertUserEventPreferences } from "@/lib/recommendations";

export async function POST(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        return Response.json({ error: "Ungultige Event-ID." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    if (!prisma.eventAlert?.findFirst || !prisma.eventAlert?.create) {
        return Response.json(
            { error: "Alert-Funktion ist derzeit nicht verfugbar." },
            { status: 503 }
        );
    }

    const existing = await prisma.eventAlert.findFirst({
        where: {
            userId: user.id,
            eventId: event.id,
        },
    });

    if (existing) {
        return Response.json({ ok: true, alert: existing, reused: true });
    }

    const alert = await prisma.$transaction(async (tx) => {
        const created = await tx.eventAlert.create({
            data: {
                userId: user.id,
                eventId: event.id,
                query: event.title,
                city: event.city,
                category: CATEGORY_MAP[event.category] ? event.category : null,
                active: true,
            },
        });
        await tx.eventInteraction.create({
            data: {
                userId: user.id,
                eventId: event.id,
                type: "ALERT",
                weight: 5,
                source: "event-alert",
            },
        });
        await upsertUserEventPreferences(tx, user.id, event, "ALERT");

        return created;
    });

    return Response.json({ ok: true, alert });
}
