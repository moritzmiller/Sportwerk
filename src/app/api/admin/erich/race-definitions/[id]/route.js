import { requireRole } from "@/lib/auth";
import { updateRaceDefinitionReview } from "@/lib/erich/master-data-review";
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
            : code === "ERICH_RACE_DEFINITION_NOT_FOUND"
              ? 404
              : String(code ?? "").startsWith("ERICH_")
                ? 400
                : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH race review failed." : error.message,
            code,
            blockers: error?.blockers ?? [],
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
        body = await readJsonBody(request, { maxBytes: 12 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const { id } = await params;

    try {
        const result = await updateRaceDefinitionReview(prisma, {
            user: admin,
            raceDefinitionId: id,
            status: normalizeSafeText(body.status, { maxLength: 40 }),
            reason: normalizeSafeText(body.reason, { maxLength: 700 }),
        });

        return Response.json({
            ok: true,
            raceDefinition: result.raceDefinition,
            review: result.review,
        });
    } catch (error) {
        console.error("[ERICH] Race review update failed:", error);
        return jsonError(error);
    }
}
