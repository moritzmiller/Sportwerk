import { requireRole } from "@/lib/auth";
import {
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { resolveSystemEvent } from "@/lib/system-events";

export async function PATCH(request) {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const id = normalizeSafeText(body.id, { maxLength: 120 });
    if (!id) {
        return Response.json({ error: "Systemereignis-ID fehlt." }, { status: 400 });
    }

    const result = await resolveSystemEvent({ id });
    if (!result.resolved) {
        return Response.json(
            { error: "Systemereignis wurde nicht gefunden oder ist bereits erledigt." },
            { status: 404 }
        );
    }

    return Response.json({
        ok: true,
        id: result.id,
        resolvedAt: result.resolvedAt.toISOString(),
    });
}
