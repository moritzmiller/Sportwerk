import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { removeRaceEntryFromRegistrationBatch } from "@/lib/erich/race-entry-service";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function jsonError(error) {
    const code = error?.code ?? null;
    const status =
        code === "ERICH_PERMISSION_DENIED"
            ? 403
            : code === "ERICH_RACE_ENTRY_NOT_FOUND"
              ? 404
              : String(code ?? "").startsWith("ERICH_")
                ? 400
                : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH race entry could not be removed." : error.message,
            code,
        },
        { status }
    );
}

export async function DELETE(request, { params }) {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    let body = {};
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    try {
        const { id, entryId } = await params;
        const result = await removeRaceEntryFromRegistrationBatch(prisma, {
            user,
            batchId: id,
            raceEntryId: entryId,
            auditReason: body.auditReason,
        });

        return Response.json({ ok: true, ...result });
    } catch (error) {
        console.error("[ERICH] Race entry removal failed:", error);
        return jsonError(error);
    }
}
