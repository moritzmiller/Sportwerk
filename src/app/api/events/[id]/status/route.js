import { getCurrentUser } from "@/lib/auth";
import { notifyMatchingAlerts } from "@/lib/event-alerts";
import { normalizeEventStatus } from "@/lib/event-management";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canPublishWithOrganization } from "@/lib/verification";

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

    const body = await request.json().catch(() => ({}));
    const requestedStatus = normalizeEventStatus(body.status, event.status);
    const publishBlocked =
        requestedStatus === "PUBLISHED" &&
        eventWithAccess.organization &&
        !canPublishWithOrganization(eventWithAccess.organization);
    const status = publishBlocked ? "DRAFT" : requestedStatus;

    const updated = await prisma.event.update({
        where: { id },
        data: {
            status,
            publishedAt:
                status === "PUBLISHED" && !event.publishedAt
                    ? new Date()
                    : event.publishedAt,
            cancelledAt: status === "CANCELLED" ? event.cancelledAt ?? new Date() : null,
            cancellationReason:
                status === "CANCELLED"
                    ? String(body.cancellationReason ?? "").trim() || event.cancellationReason
                    : status === "POSTPONED"
                        ? String(body.cancellationReason ?? "").trim() || event.cancellationReason
                        : null,
        },
    });

    await prisma.eventAuditLog.create({
        data: {
            eventId: updated.id,
            actorId: user.id,
            action: `event.status.${status.toLowerCase()}`,
            details: {
                status,
                cancellationReason: body.cancellationReason ?? null,
                publishBlocked,
            },
        },
    });

    await notifyMatchingAlerts(updated, user.id).catch((error) => {
        console.error("Event alert notification failed:", error);
    });

    return Response.json({
        ok: true,
        event: {
            ...updated,
            status,
        },
        moderation: publishBlocked
            ? {
                  blocked: true,
                  reason: "Organisation muss zuerst verifiziert werden, bevor Events veröffentlicht werden können.",
              }
            : null,
    });
}
