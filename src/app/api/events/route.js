import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageOrganization } from "@/lib/permissions";
import { CATEGORY_MAP } from "@/lib/categories";
import { normalizeEventStatus } from "@/lib/event-management";
import { notifyMatchingAlerts } from "@/lib/event-alerts";
import { normalizeTicketTypes } from "@/lib/ticket-types";
import { normalizeAllowedPaymentMethods } from "@/lib/payment-methods";
import { canPublishWithOrganization } from "@/lib/verification";
import {
    isAllowedDataImage,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

export async function POST(request) {
    const user = await getCurrentUser();

    if (!user) {
        return Response.json(
            { error: "Bitte zuerst anmelden." },
            { status: 401 }
        );
    }

    if (user.role !== "ORGANIZER" && user.role !== "ADMIN") {
        return Response.json(
            { error: "Nur Veranstalter dürfen Events erstellen." },
            { status: 403 }
        );
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 2 * 1024 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    if (!body.title || !body.location || !body.startDate) {
        return Response.json(
            { error: "Titel, Bild, Location und Startdatum sind erforderlich." },
            { status: 400 }
        );
    }

    const imageUrl = normalizeSafeText(body.imageUrl, { maxLength: 2 * 1024 * 1024 });

    if (!isAllowedDataImage(imageUrl)) {
        return Response.json(
            { error: "Bitte ein PNG-, JPEG-, WEBP- oder GIF-Bild bis 1,5 MB hochladen." },
            { status: 400 }
        );
    }

    const category = CATEGORY_MAP[body.category] ? body.category : "SONSTIGES";
    const status = normalizeEventStatus(body.status, "DRAFT");
    const capacity =
        body.capacity === "" || body.capacity === null || typeof body.capacity === "undefined"
            ? null
            : Math.max(1, Number(body.capacity) || 0);
    const organizationId = String(body.organizationId ?? "").trim() || null;
    const venueId = String(body.venueId ?? "").trim() || null;

    const ticketTypes = normalizeTicketTypes(body.ticketTypes, {
        name: "Standard",
        price: Number(body.price) || 0,
        quota: capacity,
    });
    const defaultTicketType = ticketTypes.find((ticketType) => ticketType.isDefault) ?? ticketTypes[0];
    const allowedPaymentMethods = normalizeAllowedPaymentMethods(body.allowedPaymentMethods);

    let organization = null;
    if (organizationId) {
        organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            include: { members: true },
        });

        if (!organization) {
            return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
        }

        if (!canManageOrganization(user, organization)) {
            return Response.json({ error: "Keine Berechtigung für diese Organisation." }, { status: 403 });
        }
    }

    const publishBlocked =
        status === "PUBLISHED" && organization && !canPublishWithOrganization(organization);
    const effectiveStatus = publishBlocked ? "DRAFT" : status;

    let venue = null;
    if (venueId) {
        venue = await prisma.venue.findUnique({
            where: { id: venueId },
        });

        if (!venue) {
            return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
        }

        if (organizationId) {
            if (venue.organizationId !== organizationId) {
                return Response.json(
                    { error: "Venue gehört nicht zur gewählten Organisation." },
                    { status: 403 }
                );
            }
        } else if (venue.ownerId !== user.id || venue.organizationId) {
            return Response.json(
                { error: "Venue kann nur für eigene, persönliche Events genutzt werden." },
                { status: 403 }
            );
        }
    }

    const event = await prisma.event.create({
        data: {
            title: normalizeSafeText(body.title, { maxLength: 180 }),
            description: normalizeSafeText(body.description, { maxLength: 5000 }) || null,
            imageUrl,
            location: normalizeSafeText(body.location, { maxLength: 180 }),
            city: normalizeSafeText(body.city, { maxLength: 100 }) || "Dresden",
            category,
            status: effectiveStatus,
            allowedPaymentMethods,
            startDate: new Date(body.startDate),
            price: defaultTicketType?.price ?? (Number(body.price) || 0),
            capacity,
            publishedAt: effectiveStatus === "PUBLISHED" ? new Date() : null,
            ownerId: user.id,
            organizationId,
            venueId,
        },
    });

    await prisma.eventTicketType.createMany({
        data: ticketTypes.map((ticketType) => ({
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
        })),
    });

    await prisma.eventAuditLog.create({
        data: {
            eventId: event.id,
            actorId: user.id,
            action: "event.created",
            details: {
                title: event.title,
                status: effectiveStatus,
                capacity: event.capacity,
                organizationId: event.organizationId,
                allowedPaymentMethods,
                publishBlocked,
                organizationVerificationStatus: organization?.verificationStatus ?? null,
            },
        },
    });

    await notifyMatchingAlerts(event, user.id).catch((error) => {
        console.error("Event alert notification failed:", error);
    });

    return Response.json({
        ...event,
        status: effectiveStatus,
        moderation: publishBlocked
            ? {
                  blocked: true,
                  reason: "Organisation muss zuerst verifiziert werden, bevor Events veröffentlicht werden können.",
              }
            : null,
    });
}
