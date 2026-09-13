import { getCurrentUser } from "@/lib/auth";
import { canManageOrganization } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { normalizeSeatingPlanPayload } from "@/lib/seating-plans";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function parseOrgId(value) {
    const parsed = String(value ?? "").trim();
    return parsed || null;
}

async function loadOrganization(id) {
    return prisma.organization.findUnique({
        where: { id },
        include: { members: true },
    });
}

async function requireOrganizationAccess(user, id) {
    const organization = await loadOrganization(id);
    if (!organization) {
        return { response: Response.json({ error: "Organisation nicht gefunden." }, { status: 404 }) };
    }

    if (!canManageOrganization(user, organization)) {
        return { response: Response.json({ error: "Keine Berechtigung." }, { status: 403 }) };
    }

    return { organization };
}

async function readBody(request) {
    try {
        return await readJsonBody(request, { maxBytes: 512 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return { response };
        throw error;
    }
}

function serializePlan(plan) {
    return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        layout: plan.layout,
        seatCount: plan.seatCount,
        status: plan.status,
        venueId: plan.venueId,
        organizationId: plan.organizationId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
    };
}

export async function GET(_request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const access = await requireOrganizationAccess(user, parseOrgId(resolvedParams.id));
    if (access.response) return access.response;

    const plans = await prisma.seatingPlan.findMany({
        where: { organizationId: access.organization.id },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });

    return Response.json({ seatingPlans: plans.map(serializePlan) });
}

export async function POST(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const access = await requireOrganizationAccess(user, parseOrgId(resolvedParams.id));
    if (access.response) return access.response;

    const bodyResult = await readBody(request);
    if (bodyResult.response) return bodyResult.response;

    const venueId = String(bodyResult.venueId ?? "").trim();
    const venue = venueId ? await prisma.venue.findUnique({ where: { id: venueId } }) : null;
    if (!venue || venue.organizationId !== access.organization.id) {
        return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
    }

    const payload = normalizeSeatingPlanPayload(bodyResult);
    if (payload.errors.length > 0) {
        return Response.json({ error: payload.errors[0], errors: payload.errors }, { status: 400 });
    }

    const plan = await prisma.seatingPlan.create({
        data: {
            ...payload.data,
            venueId: venue.id,
            organizationId: access.organization.id,
            ownerId: user.id,
        },
    });

    await prisma.eventAuditLog.create({
        data: {
            action: "seating_plan.created",
            actorId: user.id,
            details: {
                organizationId: access.organization.id,
                venueId: venue.id,
                seatingPlanId: plan.id,
                seatCount: plan.seatCount,
            },
        },
    });

    return Response.json({ seatingPlan: serializePlan(plan) });
}

export async function PATCH(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const access = await requireOrganizationAccess(user, parseOrgId(resolvedParams.id));
    if (access.response) return access.response;

    const bodyResult = await readBody(request);
    if (bodyResult.response) return bodyResult.response;

    const seatingPlanId = String(bodyResult.seatingPlanId ?? "").trim();
    if (!seatingPlanId) {
        return Response.json({ error: "Sitzplan fehlt." }, { status: 400 });
    }

    const existing = await prisma.seatingPlan.findUnique({ where: { id: seatingPlanId } });
    if (!existing || existing.organizationId !== access.organization.id) {
        return Response.json({ error: "Sitzplan nicht gefunden." }, { status: 404 });
    }

    const venueId = String(bodyResult.venueId ?? existing.venueId).trim();
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue || venue.organizationId !== access.organization.id) {
        return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
    }

    const payload = normalizeSeatingPlanPayload({
        name: bodyResult.name ?? existing.name,
        description: bodyResult.description ?? existing.description,
        layout: bodyResult.layout ?? existing.layout,
    });
    if (payload.errors.length > 0) {
        return Response.json({ error: payload.errors[0], errors: payload.errors }, { status: 400 });
    }

    const status = bodyResult.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
    const plan = await prisma.seatingPlan.update({
        where: { id: seatingPlanId },
        data: {
            ...payload.data,
            status,
            venueId: venue.id,
        },
    });

    await prisma.eventAuditLog.create({
        data: {
            action: "seating_plan.updated",
            actorId: user.id,
            details: {
                organizationId: access.organization.id,
                venueId: venue.id,
                seatingPlanId: plan.id,
                seatCount: plan.seatCount,
                status: plan.status,
            },
        },
    });

    return Response.json({ seatingPlan: serializePlan(plan) });
}

export async function DELETE(request, { params }) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const resolvedParams = await params;
    const access = await requireOrganizationAccess(user, parseOrgId(resolvedParams.id));
    if (access.response) return access.response;

    const bodyResult = await readBody(request);
    if (bodyResult.response) return bodyResult.response;

    const seatingPlanId = String(bodyResult.seatingPlanId ?? "").trim();
    if (!seatingPlanId) {
        return Response.json({ error: "Sitzplan fehlt." }, { status: 400 });
    }

    const existing = await prisma.seatingPlan.findUnique({ where: { id: seatingPlanId } });
    if (!existing || existing.organizationId !== access.organization.id) {
        return Response.json({ error: "Sitzplan nicht gefunden." }, { status: 404 });
    }

    await prisma.seatingPlan.delete({ where: { id: seatingPlanId } });

    await prisma.eventAuditLog.create({
        data: {
            action: "seating_plan.deleted",
            actorId: user.id,
            details: {
                organizationId: access.organization.id,
                venueId: existing.venueId,
                seatingPlanId,
            },
        },
    });

    return Response.json({ ok: true });
}
