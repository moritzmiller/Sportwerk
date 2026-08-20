import { requireRole } from "@/lib/auth";
import { recordManualEligibilityDecision } from "@/lib/erich/licenses";
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
            error: status === 500 ? "ERICH eligibility decision failed." : error.message,
            code,
        },
        { status }
    );
}

export async function POST(request) {
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

    try {
        const result = await recordManualEligibilityDecision(prisma, {
            user: admin,
            eventId: normalizeSafeText(body.eventId, { maxLength: 120 }) || null,
            athleteId: normalizeSafeText(body.athleteId, { maxLength: 120 }),
            raceEntryId: normalizeSafeText(body.raceEntryId, { maxLength: 120 }) || null,
            status: normalizeSafeText(body.status, { maxLength: 40 }),
            reason: normalizeSafeText(body.reason, { maxLength: 700 }),
            decisionData: body.decisionData ?? null,
        });

        return Response.json({ ok: true, ...result }, { status: 201 });
    } catch (error) {
        console.error("[ERICH] Eligibility decision failed:", error);
        return jsonError(error);
    }
}
