import { getCurrentUser } from "@/lib/auth";
import { CATEGORY_MAP } from "@/lib/categories";
import { normalizeEventStatus } from "@/lib/event-management";
import { normalizeEventOptions, normalizeEventType } from "@/lib/event-options";
import { canManageEvent, canManageOrganization } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeTicketTypes } from "@/lib/ticket-types";
import { normalizeAllowedPaymentMethods } from "@/lib/payment-methods";
import { canPublishWithOrganization } from "@/lib/verification";
import {
    isAllowedImageReference,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

function normalizeCapacity(value) {
    if (value === "" || value === null || typeof value === "undefined") return null;
    const capacity = Number(value);
    return Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : null;
}

export async function GET(_request, { params }) {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        return Response.json({ error: "Ungultige Event-ID." }, { status: 400 });
    }

    const user = await getCurrentUser();
    const event = await prisma.event.findUnique({
        where: { id },
        include: {
            owner: { select: { id: true, email: true, name: true } },
            organization: {
                include: {
                    members: true,
                },
            },
            members: true,
            ticketTypes: {
                orderBy: [
                    { isDefault: "desc" },
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
                ],
            },
        },
    });

    if (!event) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    const canManage = canManageEvent(user, event);

    if (event.status === "DRAFT" && !canManage) {
        return Response.json({ error: "Nicht freigegeben." }, { status: 403 });
    }

    if (!canManage) {
        return Response.json({
            id: event.id,
            title: event.title,
            description: event.description,
            imageUrl: event.imageUrl,
            location: event.location,
            city: event.city,
            category: event.category,
            eventType: event.eventType,
            eventOptions: event.eventOptions,
            status: event.status,
            allowedPaymentMethods: event.allowedPaymentMethods,
            startDate: event.startDate,
            price: event.price,
            capacity: event.capacity,
            soldTickets: event.soldTickets,
            viewCount: event.viewCount,
            organization: event.organization
                ? {
                      id: event.organization.id,
                      name: event.organization.name,
                      verificationStatus: event.organization.verificationStatus,
                  }
                : null,
            ticketTypes: event.ticketTypes.map((ticketType) => ({
                id: ticketType.id,
                name: ticketType.name,
                description: ticketType.description,
                price: ticketType.price,
                currency: ticketType.currency,
                quota: ticketType.quota,
                soldCount: ticketType.soldCount,
                maxPerBooking: ticketType.maxPerBooking,
                isDefault: ticketType.isDefault,
                sortOrder: ticketType.sortOrder,
            })),
        });
    }

    return Response.json(event);
}

export async function PATCH(request, { params }) {
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
    const eventWithAccess = await prisma.event.findUnique({
        where: { id },
        include: {
            organization: { include: { members: true } },
            members: true,
            ticketTypes: {
                orderBy: [
                    { isDefault: "desc" },
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
                ],
            },
        },
    });
    if (!eventWithAccess) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    if (!canManageEvent(user, eventWithAccess)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 2 * 1024 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }
    const nextStatus = normalizeEventStatus(body.status, event.status);
    const nextEventType =
        typeof body.eventType === "string" ? normalizeEventType(body.eventType) : event.eventType;
    const nextEventOptions =
        typeof body.eventOptions === "object"
            ? normalizeEventOptions(nextEventType, body.eventOptions)
            : normalizeEventOptions(nextEventType, event.eventOptions);
    const nextCapacity = normalizeCapacity(body.capacity);
    const nextPrice = Number(body.price);
    const nextOrganizationId =
        typeof body.organizationId === "string" ? body.organizationId.trim() : null;
    const nextVenueId = typeof body.venueId === "string" ? body.venueId.trim() : null;
    const nextTicketTypes = Array.isArray(body.ticketTypes)
        ? normalizeTicketTypes(body.ticketTypes, {
              name: "Standard",
              price: Number.isFinite(nextPrice) ? nextPrice : event.price,
              quota: nextCapacity ?? event.capacity,
          })
        : null;
    const nextAllowedPaymentMethods =
        Array.isArray(body.allowedPaymentMethods)
            ? normalizeAllowedPaymentMethods(body.allowedPaymentMethods)
            : event.allowedPaymentMethods;
    const nextImageUrl =
        typeof body.imageUrl === "string"
            ? normalizeSafeText(body.imageUrl, { maxLength: 2 * 1024 * 1024 })
            : event.imageUrl;

    if (nextImageUrl && !isAllowedImageReference(nextImageUrl)) {
        return Response.json(
            { error: "Bitte eine HTTPS-Bild-URL oder ein PNG-, JPEG-, WEBP- oder GIF-Bild bis 1,5 MB verwenden." },
            { status: 400 }
        );
    }

    if (nextOrganizationId && nextOrganizationId !== event.organizationId) {
        const nextOrganization = await prisma.organization.findUnique({
            where: { id: nextOrganizationId },
            include: { members: true },
        });

        if (!nextOrganization) {
            return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
        }

        if (!canManageOrganization(user, nextOrganization)) {
            return Response.json({ error: "Keine Berechtigung für diese Organisation." }, { status: 403 });
        }
    }

    const effectiveOrganization = nextOrganizationId
        ? await prisma.organization.findUnique({
              where: { id: nextOrganizationId },
              include: { members: true },
          })
        : eventWithAccess.organization;
    const publishBlocked =
        nextStatus === "PUBLISHED" &&
        effectiveOrganization &&
        !canPublishWithOrganization(effectiveOrganization);
    const effectiveStatus = publishBlocked ? "DRAFT" : nextStatus;

    if (nextVenueId !== null && nextVenueId !== "") {
        const nextVenue = await prisma.venue.findUnique({
            where: { id: nextVenueId },
        });

        if (!nextVenue) {
            return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
        }

        const effectiveOrganizationId = nextOrganizationId ?? event.organizationId ?? null;
        if (effectiveOrganizationId) {
            if (nextVenue.organizationId !== effectiveOrganizationId) {
                return Response.json(
                    { error: "Venue gehört nicht zur gewählten Organisation." },
                    { status: 403 }
                );
            }
        } else if (nextVenue.ownerId !== user.id || nextVenue.organizationId) {
            return Response.json(
                { error: "Venue kann nur für eigene, persönliche Events genutzt werden." },
                { status: 403 }
            );
        }
    }

    if (nextCapacity !== null && nextCapacity < Number(event.soldTickets || 0)) {
        return Response.json(
            { error: "Kapazitat kann nicht unter die bereits verkauften Tickets gesetzt werden." },
            { status: 400 }
        );
    }

    if (nextTicketTypes) {
        const existingTicketTypes = await prisma.eventTicketType.findMany({
            where: { eventId: event.id },
            orderBy: [{ createdAt: "asc" }],
        });
        const existingById = new Map(existingTicketTypes.map((ticketType) => [ticketType.id, ticketType]));
        const nextIds = new Set();

        for (const ticketType of nextTicketTypes) {
            if (ticketType.id && existingById.has(ticketType.id)) {
                nextIds.add(ticketType.id);
                await prisma.eventTicketType.update({
                    where: { id: ticketType.id },
                    data: {
                        name: ticketType.name,
                        description: ticketType.description,
                        price: ticketType.price,
                        currency: ticketType.currency,
                        quota: ticketType.quota,
                        maxPerBooking: ticketType.maxPerBooking,
                        isDefault: ticketType.isDefault,
                        sortOrder: ticketType.sortOrder,
                    },
                });
            } else {
                const created = await prisma.eventTicketType.create({
                    data: {
                        eventId: event.id,
                        name: ticketType.name,
                        description: ticketType.description,
                        price: ticketType.price,
                        currency: ticketType.currency,
                        quota: ticketType.quota,
                        soldCount: 0,
                        maxPerBooking: ticketType.maxPerBooking,
                        isDefault: ticketType.isDefault,
                        sortOrder: ticketType.sortOrder,
                    },
                });
                nextIds.add(created.id);
            }
        }

        const removedTicketTypes = existingTicketTypes.filter(
            (ticketType) => !nextIds.has(ticketType.id)
        );

        if (removedTicketTypes.length > 0) {
            await prisma.eventTicketType.deleteMany({
                where: {
                    id: {
                        in: removedTicketTypes.map((ticketType) => ticketType.id),
                    },
                },
            });
        }
    }

    const updatedTicketTypes = await prisma.eventTicketType.findMany({
        where: { eventId: event.id },
        orderBy: [
            { isDefault: "desc" },
            { sortOrder: "asc" },
            { createdAt: "asc" },
        ],
    });
    const defaultTicketType = updatedTicketTypes.find((ticketType) => ticketType.isDefault) ?? updatedTicketTypes[0];

    const updated = await prisma.event.update({
        where: { id },
        data: {
            title:
                typeof body.title === "string"
                    ? normalizeSafeText(body.title, { maxLength: 180 })
                    : event.title,
            description:
                typeof body.description === "string"
                    ? normalizeSafeText(body.description, { maxLength: 5000 }) || null
                    : event.description,
            imageUrl: nextImageUrl,
            location:
                typeof body.location === "string"
                    ? normalizeSafeText(body.location, { maxLength: 180 })
                    : event.location,
            city:
                typeof body.city === "string"
                    ? normalizeSafeText(body.city, { maxLength: 100 }) || event.city
                    : event.city,
            category: CATEGORY_MAP[body.category] ? body.category : event.category,
            eventType: nextEventType,
            eventOptions: nextEventOptions,
            organizationId:
                nextOrganizationId === "" ? null : nextOrganizationId ?? event.organizationId,
            venueId: nextVenueId === "" ? null : nextVenueId ?? event.venueId,
            status: effectiveStatus,
            allowedPaymentMethods: nextAllowedPaymentMethods,
            startDate: body.startDate ? new Date(body.startDate) : event.startDate,
            price:
                defaultTicketType?.price ??
                (Number.isFinite(nextPrice) ? nextPrice : event.price),
            capacity: nextCapacity,
            publishedAt:
                effectiveStatus === "PUBLISHED" && !event.publishedAt
                    ? new Date()
                    : event.publishedAt,
            cancelledAt: effectiveStatus === "CANCELLED" ? event.cancelledAt ?? new Date() : null,
            cancellationReason:
                effectiveStatus === "CANCELLED"
                    ? String(body.cancellationReason ?? "").trim() || event.cancellationReason
                    : null,
        },
    });

    await prisma.eventAuditLog.create({
        data: {
            eventId: updated.id,
            actorId: user.id,
            action: "event.updated",
            details: {
                title: updated.title,
                status: updated.status,
                capacity: updated.capacity,
                organizationId: updated.organizationId,
                venueId: updated.venueId,
                allowedPaymentMethods: updated.allowedPaymentMethods,
                eventType: updated.eventType,
                publishBlocked,
            },
        },
    });

    return Response.json({
        ...updated,
        status: effectiveStatus,
        moderation: publishBlocked
            ? {
                  blocked: true,
                  reason: "Organisation muss zuerst verifiziert werden, bevor Events veröffentlicht werden können.",
              }
            : null,
    });
}
