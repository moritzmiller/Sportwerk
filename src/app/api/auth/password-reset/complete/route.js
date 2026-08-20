import {
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPasswordResetToken } from "@/lib/password-reset-tokens";
import { logSystemEvent } from "@/lib/system-events";

function inputError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

export async function POST(request) {
    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const token = String(body.token || "");
    const password = String(body.password || "");

    if (password.length < 8 || password.length > 200) {
        return inputError("Bitte verwende mindestens 8 Zeichen.");
    }

    const parsed = verifyPasswordResetToken(token);
    if (!parsed.ok) {
        return inputError("Der Reset-Link ist ungueltig oder abgelaufen.", 401);
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: parsed.userId },
            select: {
                id: true,
                email: true,
                disabledAt: true,
            },
        });

        if (!user || user.disabledAt || user.email.toLowerCase() !== parsed.email) {
            return inputError("Der Reset-Link ist ungueltig oder abgelaufen.", 401);
        }

        const supabase = createAdminClient();
        const { error } = await supabase.auth.admin.updateUserById(user.id, {
            password,
        });

        if (error) {
            throw error;
        }

        return Response.json({ ok: true });
    } catch (error) {
        console.error("[Password reset] Password update failed:", error);
        await logSystemEvent({
            area: "auth",
            message: "Password reset update failed.",
            details: error,
        });
        return Response.json(
            { error: "Passwort konnte nicht geaendert werden." },
            { status: 503 }
        );
    }
}
