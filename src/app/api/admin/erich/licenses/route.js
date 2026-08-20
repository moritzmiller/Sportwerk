import { requireRole } from "@/lib/auth";
import { importErichLicenseRecords } from "@/lib/erich/licenses";
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
            error: status === 500 ? "ERICH license import failed." : error.message,
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
        body = await readJsonBody(request, { maxBytes: 512 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    try {
        const result = await importErichLicenseRecords(prisma, {
            user: admin,
            eventId: normalizeSafeText(body.eventId, { maxLength: 120 }),
            rows: body.records ?? body.rows ?? [],
            sheetName: normalizeSafeText(body.sheetName, { maxLength: 120 }) || null,
            columnMapping: body.columnMapping ?? null,
            auditReason:
                normalizeSafeText(body.reason, { maxLength: 700 }) ||
                "Import ERICH license records",
        });

        return Response.json({ ok: true, ...result }, { status: 201 });
    } catch (error) {
        console.error("[ERICH] License import failed:", error);
        return jsonError(error);
    }
}
