import { getCurrentUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    const eventWithAccess = await prisma.event.findUnique({
        where: { id },
        include: {
            organization: { include: { members: true } },
            members: true,
        },
    });

    if (!canManageEvent(user, eventWithAccess)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const duplicated = await prisma.event.create({
        data: {
            title: `${event.title} (Kopie)`,
            description: event.description,
            imageUrl: event.imageUrl,
            location: event.location,
            city: event.city,
            category: event.category,
            eventType: event.eventType,
            eventOptions: event.eventOptions,
            status: "DRAFT",
            allowedPaymentMethods: event.allowedPaymentMethods,
            startDate: event.startDate,
            price: event.price,
            capacity: event.capacity,
            ownerId: user.id,
            organizationId: event.organizationId,
            venueId: event.venueId,
            duplicateOfId: event.id,
        },
    });

    const ticketTypes = await prisma.eventTicketType.findMany({
        where: { eventId: event.id },
        orderBy: [
            { isDefault: "desc" },
            { sortOrder: "asc" },
            { createdAt: "asc" },
        ],
    });

    if (ticketTypes.length > 0) {
        await prisma.eventTicketType.createMany({
            data: ticketTypes.map((ticketType, index) => ({
                eventId: duplicated.id,
                name: ticketType.name,
                description: ticketType.description,
                price: ticketType.price,
                currency: ticketType.currency,
                quota: ticketType.quota,
                soldCount: 0,
                maxPerBooking: ticketType.maxPerBooking,
                isDefault: ticketType.isDefault,
                sortOrder: index,
            })),
        });
    }

    await prisma.eventAuditLog.create({
        data: {
            eventId: duplicated.id,
            actorId: user.id,
            action: "event.duplicated",
            details: {
                sourceEventId: event.id,
            },
        },
    });

    return Response.json({ ok: true, event: duplicated });
}
