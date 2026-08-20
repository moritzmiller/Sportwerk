import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function slugify(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, 48);
}

function isOrganizer(user) {
    return user?.role === "ORGANIZER" || user?.role === "ADMIN";
}

async function makeUniqueSlug(baseSlug) {
    const fallback = baseSlug || "orga";
    let slug = fallback;
    let counter = 2;

    while (await prisma.organization.findUnique({ where: { slug } })) {
        slug = `${fallback}-${counter}`;
        counter += 1;
    }

    return slug;
}

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const organizations = await prisma.organization.findMany({
        where:
            user.role === "ADMIN"
                ? {}
                : {
                      OR: [
                          { ownerId: user.id },
                          { members: { some: { userId: user.id } } },
                      ],
                  },
        orderBy: { createdAt: "desc" },
        include: {
            owner: { select: { id: true, email: true, name: true } },
            members: {
                include: {
                    user: { select: { id: true, email: true, name: true } },
                },
                orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            },
            events: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    startDate: true,
                },
            },
        },
    });

    return Response.json({ organizations });
}

export async function POST(request) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    if (!isOrganizer(user)) {
        return Response.json({ error: "Nur Veranstalter können Organisationen anlegen." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) {
        return Response.json({ error: "Ein Organisationsname ist erforderlich." }, { status: 400 });
    }

    const slugBase = slugify(body.slug || name);
    const slug = await makeUniqueSlug(slugBase);

    const organization = await prisma.organization.create({
        data: {
            name,
            slug,
            description: String(body.description ?? "").trim() || null,
            verificationRequestedAt: new Date(),
            ownerId: user.id,
            members: {
                create: {
                    userId: user.id,
                    role: "OWNER",
                },
            },
        },
        include: {
            owner: { select: { id: true, email: true, name: true } },
            members: {
                include: {
                    user: { select: { id: true, email: true, name: true } },
                },
            },
        },
    });

    await prisma.eventAuditLog.create({
        data: {
            action: "organization.created",
            actorId: user.id,
            details: {
                organizationId: organization.id,
                slug: organization.slug,
            },
        },
    });

    return Response.json({ organization });
}
