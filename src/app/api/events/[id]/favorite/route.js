import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { upsertUserEventPreferences } from "@/lib/recommendations";

export async function POST(_request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        return Response.json({ error: "Ungultige Event-ID." }, { status: 400 });
    }

    if (!prisma.eventFavorite?.findUnique || !prisma.eventFavorite?.create) {
        return Response.json(
            { error: "Favoriten-Funktion ist derzeit nicht verfugbar." },
            { status: 503 }
        );
    }

    const event = await prisma.event.findUnique({
        where: { id },
        select: {
            id: true,
            category: true,
            city: true,
            location: true,
            price: true,
            startDate: true,
            organizationId: true,
            venueId: true,
        },
    });

    if (!event) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    const existing = await prisma.eventFavorite.findUnique({
        where: {
            userId_eventId: {
                userId: user.id,
                eventId: id,
            },
        },
    });

    if (existing) {
        await prisma.$transaction(async (tx) => {
            await tx.eventFavorite.delete({ where: { id: existing.id } }).catch((error) => {
                if (error?.code !== "P2025") throw error;
            });
            await tx.eventInteraction.create({
                data: {
                    userId: user.id,
                    eventId: id,
                    type: "UNFAVORITE",
                    weight: -3,
                    source: "favorite-toggle",
                },
            });
            await upsertUserEventPreferences(tx, user.id, event, "UNFAVORITE");
        });
        return Response.json({ ok: true, favorited: false });
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.eventFavorite.create({
                data: {
                    userId: user.id,
                    eventId: id,
                },
            });
            await tx.eventInteraction.create({
                data: {
                    userId: user.id,
                    eventId: id,
                    type: "FAVORITE",
                    weight: 7,
                    source: "favorite-toggle",
                },
            });
            await upsertUserEventPreferences(tx, user.id, event, "FAVORITE");
        });
    } catch (error) {
        if (error?.code === "P2003" || error?.code === "P2025") {
            return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
        }
        throw error;
    }

    return Response.json({ ok: true, favorited: true });
}
