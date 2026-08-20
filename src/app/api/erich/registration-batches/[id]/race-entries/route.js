import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { createRaceEntryForRegistrationBatch } from "@/lib/erich/race-entry-service";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function jsonError(error) {
    const code = error?.code ?? null;
    const status = code === "ERICH_PERMISSION_DENIED" ? 403 : String(code ?? "").startsWith("ERICH_") ? 400 : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH race entry could not be created." : error.message,
            code,
            reasonCodes: error?.reasonCodes ?? undefined,
        },
        { status }
    );
}

export async function POST(request, { params }) {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    try {
        const { id } = await params;
        const result = await createRaceEntryForRegistrationBatch(prisma, {
            user,
            batchId: id,
            athleteId: body.athleteId,
            raceDefinitionId: body.raceDefinitionId,
            phaseKey: body.phaseKey ?? null,
            targetTime: body.targetTime,
            auditReason: body.auditReason,
        });

        return Response.json(
            {
                ok: true,
                raceEntry: result.raceEntry,
                valuations: result.valuationRows,
                draft: result.draft,
            },
            { status: 201 }
        );
    } catch (error) {
        if (!String(error?.code ?? "").startsWith("ERICH_")) {
            console.error("[ERICH] Race entry creation failed:", error);
        }
        return jsonError(error);
    }
}
