import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import {
    createOrReuseTemporaryRegistrationBatch,
    listRegistrationBatches,
} from "@/lib/erich/registration-service";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function jsonError(error) {
    const code = error?.code ?? null;
    const status = code === "ERICH_PERMISSION_DENIED" ? 403 : String(code ?? "").startsWith("ERICH_") ? 400 : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH registration batch request failed." : error.message,
            code,
        },
        { status }
    );
}

export async function GET(request) {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ batches: [] });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId") || null;

    try {
        const batches = await listRegistrationBatches(prisma, { user, eventId });
        return Response.json({ batches });
    } catch (error) {
        console.error("[ERICH] Registration batch list failed:", error);
        return jsonError(error);
    }
}

export async function POST(request) {
    const { user } = await getCurrentErichUserOrGuest({ createGuest: true });

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
        const result = await createOrReuseTemporaryRegistrationBatch(prisma, {
            user,
            eventId: body.eventId,
            accountId: body.accountId ?? user.id,
        });

        return Response.json(
            {
                ok: true,
                reused: result.reused,
                batch: result.batch,
            },
            { status: result.reused ? 200 : 201 }
        );
    } catch (error) {
        console.error("[ERICH] Registration batch creation failed:", error);
        return jsonError(error);
    }
}
