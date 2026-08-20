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
        },
    });
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
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "MEMBER").trim().toUpperCase();
    const validRoles = new Set(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

    if (!email) {
        return Response.json({ error: "Eine E-Mail ist erforderlich." }, { status: 400 });
    }

    if (!validRoles.has(role)) {
        return Response.json({ error: "Ungültige Rolle." }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
        return Response.json({ error: "Dieser Nutzer existiert noch nicht." }, { status: 404 });
    }

    const nextRole = targetUser.id === organization.ownerId ? "OWNER" : role;

    const member = await prisma.organizationMember.upsert({
        where: {
            organizationId_userId: {
                organizationId: organization.id,
                userId: targetUser.id,
            },
        },
        create: {
            organizationId: organization.id,
            userId: targetUser.id,
            role: nextRole,
        },
        update: {
            role: nextRole,
        },
        include: {
            user: { select: { id: true, email: true, name: true } },
        },
    });

    return Response.json({ ok: true, member });
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
    const memberId = String(body.memberId ?? "").trim();
    const role = String(body.role ?? "").trim().toUpperCase();
    const validRoles = new Set(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

    if (!memberId) {
        return Response.json({ error: "Mitglied fehlt." }, { status: 400 });
    }

    if (!validRoles.has(role)) {
        return Response.json({ error: "Ungültige Rolle." }, { status: 400 });
    }

    if (memberId === organization.ownerId) {
        return Response.json({ error: "Der Owner kann nicht umgestellt werden." }, { status: 400 });
    }

    const result = await prisma.organizationMember.updateMany({
        where: { organizationId: organization.id, userId: memberId },
        data: { role },
    });

    if (result.count === 0) {
        return Response.json({ error: "Mitglied nicht gefunden." }, { status: 404 });
    }

    const member = await prisma.organizationMember.findUnique({
        where: {
            organizationId_userId: {
                organizationId: organization.id,
                userId: memberId,
            },
        },
        include: {
            user: { select: { id: true, email: true, name: true } },
        },
    });

    return Response.json({ ok: true, member });
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
    const memberId = String(body.memberId ?? "").trim();
    if (!memberId) {
        return Response.json({ error: "Mitglied fehlt." }, { status: 400 });
    }

    if (memberId === organization.ownerId) {
        return Response.json({ error: "Der Owner kann nicht entfernt werden." }, { status: 400 });
    }

    const result = await prisma.organizationMember.deleteMany({
        where: { organizationId: organization.id, userId: memberId },
    });

    if (result.count === 0) {
        return Response.json({ error: "Mitglied nicht gefunden." }, { status: 404 });
    }

    return Response.json({ ok: true });
}
