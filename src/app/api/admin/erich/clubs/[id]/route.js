import { requireRole } from "@/lib/auth";
import { updateErichClub } from "@/lib/erich/clubs";
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
            : code === "ERICH_CLUB_NOT_FOUND"
              ? 404
              : String(code ?? "").startsWith("ERICH_")
                ? 400
                : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH club update failed." : error.message,
            code,
        },
        { status }
    );
}

export async function PATCH(request, { params }) {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 64 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const { id } = await params;

    try {
        const club = await updateErichClub(prisma, {
            user: admin,
            clubId: id,
            input: body.club ?? body,
            eventId: normalizeSafeText(body.eventId, { maxLength: 120 }) || null,
            auditReason:
                normalizeSafeText(body.reason, { maxLength: 700 }) ||
                "Update ERICH club master data",
        });

        return Response.json({ ok: true, club });
    } catch (error) {
        console.error("[ERICH] Club update failed:", error);
        return jsonError(error);
    }
}
