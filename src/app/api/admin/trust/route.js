import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(["PENDING", "VERIFIED", "REJECTED"]);

async function loadQueues() {
    const [organizations, venues] = await Promise.all([
        prisma.organization.findMany({
            orderBy: [{ updatedAt: "desc" }],
            include: {
                owner: { select: { id: true, email: true, name: true } },
                reviewedBy: { select: { id: true, email: true, name: true } },
                members: {
                    include: {
                        user: { select: { id: true, email: true, name: true } },
                    },
                },
                venues: {
                    include: {
                        events: {
                            where: {
                                status: "PUBLISHED",
                            },
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
        }),
        prisma.venue.findMany({
            orderBy: [{ updatedAt: "desc" }],
            include: {
                owner: { select: { id: true, email: true, name: true } },
                reviewedBy: { select: { id: true, email: true, name: true } },
                organization: {
                    select: {
                        id: true,
                        name: true,
                        verificationStatus: true,
                    },
                },
                events: {
                    where: {
                        status: "PUBLISHED",
                    },
                    select: {
                        id: true,
                    },
                },
            },
        }),
    ]);

    return { organizations, venues };
}

export async function GET() {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    return Response.json(await loadQueues());
}

export async function PATCH(request) {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const entityType = String(body.entityType ?? "").trim();
    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "").trim().toUpperCase();
    const reviewNotes = String(body.reviewNotes ?? "").trim() || null;

    if (!id || !VALID_STATUSES.has(status)) {
        return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }

    if (entityType === "organization") {
        const result = await prisma.organization.updateMany({
            where: { id },
            data: {
                verificationStatus: status,
                reviewedAt: new Date(),
                reviewedById: admin.id,
                reviewNotes,
                verificationRequestedAt:
                    status === "PENDING" ? new Date() : undefined,
            },
        });

        if (result.count === 0) {
            return Response.json({ error: "Organisation nicht gefunden." }, { status: 404 });
        }

        const updated = await prisma.organization.findUnique({
            where: { id },
        });

        await prisma.eventAuditLog.create({
            data: {
                actorId: admin.id,
                action: `organization.verification.${status.toLowerCase()}`,
                details: {
                    organizationId: updated.id,
                    reviewNotes,
                },
            },
        });

        return Response.json({ ok: true, organization: updated });
    }

    if (entityType === "venue") {
        const result = await prisma.venue.updateMany({
            where: { id },
            data: {
                verificationStatus: status,
                reviewedAt: new Date(),
                reviewedById: admin.id,
                reviewNotes,
                verificationRequestedAt:
                    status === "PENDING" ? new Date() : undefined,
            },
        });

        if (result.count === 0) {
            return Response.json({ error: "Venue nicht gefunden." }, { status: 404 });
        }

        const updated = await prisma.venue.findUnique({
            where: { id },
        });

        await prisma.eventAuditLog.create({
            data: {
                actorId: admin.id,
                action: `venue.verification.${status.toLowerCase()}`,
                details: {
                    venueId: updated.id,
                    reviewNotes,
                },
            },
        });

        return Response.json({ ok: true, venue: updated });
    }

    return Response.json({ error: "Unbekannter Entitätstyp." }, { status: 400 });
}
