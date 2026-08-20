import { requireRole } from "@/lib/auth";
import {
    createErichClub,
    importErichClubs,
} from "@/lib/erich/clubs";
import { prisma } from "@/lib/prisma";
import {
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

function jsonError(error) {
    const code = error?.code ?? null;
    const status =
        code === "ERICH_PERMISSION_DENIED"
            ? 403
            : String(code ?? "").startsWith("ERICH_")
              ? 400
              : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH club request failed." : error.message,
            code,
        },
        { status }
    );
}

export async function GET(request) {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = normalizeSafeText(searchParams.get("q"), { maxLength: 120 }).toLowerCase();
    const active = searchParams.get("active");

    const clubs = await prisma.erichClub.findMany({
        where: {
            ...(query ? { searchText: { contains: query } } : {}),
            ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
        },
        orderBy: [{ active: "desc" }, { officialName: "asc" }],
        take: 250,
    });

    return Response.json({ clubs });
}

export async function POST(request) {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 256 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    try {
        if (Array.isArray(body.clubs)) {
            const result = await importErichClubs(prisma, {
                user: admin,
                eventId: normalizeSafeText(body.eventId, { maxLength: 120 }),
                rows: body.clubs,
                originalFileName: normalizeSafeText(body.originalFileName, { maxLength: 240 }) || null,
                auditReason:
                    normalizeSafeText(body.reason, { maxLength: 700 }) ||
                    "Import ERICH club master data",
            });

            return Response.json({ ok: true, ...result }, { status: 201 });
        }

        const club = await createErichClub(prisma, {
            user: admin,
            input: body.club ?? body,
            eventId: normalizeSafeText(body.eventId, { maxLength: 120 }) || null,
            auditReason:
                normalizeSafeText(body.reason, { maxLength: 700 }) ||
                "Create ERICH club master data",
        });

        return Response.json({ ok: true, club }, { status: 201 });
    } catch (error) {
        console.error("[ERICH] Club request failed:", error);
        return jsonError(error);
    }
}
