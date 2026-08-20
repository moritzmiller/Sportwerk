import { getCurrentUser } from "@/lib/auth";
import { canManageOrganization } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function parseOrgId(value) {
    const parsed = String(value ?? "").trim();
    return parsed || null;
}

async function loadOrganization(id) {
    return prisma.organization.findUnique({
        where: { id },
        include: {
            owner: { select: { id: true, email: true, name: true } },
            members: {
                include: { user: { select: { id: true, email: true, name: true } } },
            },
            venues: {
                orderBy: { createdAt: "desc" },
                include: {
                    events: {
                        select: {
                            id: true,
                            title: true,
                            startDate: true,
                            status: true,
                        },
                    },
                },
            },
        },
    });
}

function normalizeVenuePayload(body = {}) {
    return {
        name: String(body.name ?? "").trim(),
        address: String(body.address ?? "").trim() || null,
        city: String(body.city ?? "").trim() || null,
        notes: String(body.notes ?? "").trim() || null,
    };
}

export async function GET(_request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const organization = await loadOrganization(parseOrgId(resolvedParams.id));
    if (!organization) {
        return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
    }

    if (!canManageOrganization(user, organization)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    return Response.json({ organization });
}

export async function POST(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const organization = await loadOrganization(parseOrgId(resolvedParams.id));
    if (!organization) {
        return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
    }

    if (!canManageOrganization(user, organization)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const payload = normalizeVenuePayload(body);

    if (!payload.name) {
        return Response.json({ error: "Ein Venue-Name ist erforderlich." }, { status: 400 });
    }

    const venue = await prisma.venue.create({
        data: {
            ...payload,
            ownerId: user.id,
            organizationId: organization.id,
            verificationRequestedAt: new Date(),
        },
        include: {
            events: {
                select: {
                    id: true,
                    title: true,
                    startDate: true,
                    status: true,
                },
            },
        },
    });

    await prisma.eventAuditLog.create({
        data: {
            action: "venue.created",
            actorId: user.id,
            details: {
                organizationId: organization.id,
                venueId: venue.id,
                name: venue.name,
            },
        },
    });

    return Response.json({ venue });
}

export async function PATCH(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const organization = await loadOrganization(parseOrgId(resolvedParams.id));
    if (!organization) {
        return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
    }

    if (!canManageOrganization(user, organization)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const venueId = String(body.venueId ?? "").trim();
    const payload = normalizeVenuePayload(body);

    if (!venueId) {
        return Response.json({ error: "Venue fehlt." }, { status: 400 });
    }

    const existingVenue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!existingVenue || existingVenue.organizationId !== organization.id) {
        return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
    }

    const venue = await prisma.venue.update({
        where: {
            id: venueId,
        },
        data: {
            ...(payload.name ? { name: payload.name } : {}),
            ...(body.address !== undefined ? { address: payload.address } : {}),
            ...(body.city !== undefined ? { city: payload.city } : {}),
            ...(body.notes !== undefined ? { notes: payload.notes } : {}),
        },
        include: {
            events: {
                select: {
                    id: true,
                    title: true,
                    startDate: true,
                    status: true,
                },
            },
        },
    });

    return Response.json({ venue });
}

export async function DELETE(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const organization = await loadOrganization(parseOrgId(resolvedParams.id));
    if (!organization) {
        return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
    }

    if (!canManageOrganization(user, organization)) {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const venueId = String(body.venueId ?? "").trim();

    if (!venueId) {
        return Response.json({ error: "Venue fehlt." }, { status: 400 });
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue || venue.organizationId !== organization.id) {
        return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
    }

    await prisma.venue.delete({ where: { id: venueId } });

    return Response.json({ ok: true });
}
