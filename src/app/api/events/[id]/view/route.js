import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { upsertUserEventPreferences } from "@/lib/recommendations";
import {
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

export async function POST(request, { params }) {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        return Response.json({ error: "Ungultige Event-ID." }, { status: 400 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }
    const user = await getCurrentUser().catch(() => null);

    const source = body.source
        ? normalizeSafeText(body.source, { maxLength: 80 })
        : null;
    const referrer = body.referrer
        ? normalizeSafeText(body.referrer, { maxLength: 500 })
        : null;

    const event = await prisma.$transaction(async (tx) => {
        const result = await tx.event.updateMany({
            where: { id },
            data: {
                viewCount: { increment: 1 },
            },
        });

        if (result.count === 0) return null;

        await tx.eventView.create({
            data: {
                eventId: id,
                userId: user?.id ?? null,
                source,
                referrer,
            },
        });

        await tx.eventInteraction.create({
            data: {
                eventId: id,
                userId: user?.id ?? null,
                type: "VIEW",
                weight: 1,
                source,
                metadata: referrer ? { referrer } : null,
            },
        });

        const viewedEvent = await tx.event.findUnique({
            where: { id },
            select: {
                id: true,
                viewCount: true,
                category: true,
                city: true,
                location: true,
                price: true,
                startDate: true,
                organizationId: true,
                venueId: true,
            },
        });

        await upsertUserEventPreferences(tx, user?.id, viewedEvent, "VIEW");

        return viewedEvent;
    });

    if (!event) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    return Response.json({
        ok: true,
        event: {
            id: event.id,
            viewCount: event.viewCount,
        },
    });
}
