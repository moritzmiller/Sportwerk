import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/server";
import { getSafeUserQueryConfig } from "@/lib/user-schema";
import {
    disableUserAccount,
    reactivateUserAccount,
} from "@/lib/user-deactivation";

const VALID_ROLES = ["VISITOR", "ORGANIZER", "ADMIN"];

async function banSupabaseUser(id) {
    try {
        const sb = createAdminClient();
        await sb.auth.admin.updateUserById(id, {
            ban_duration: "876000h",
        });
    } catch (e) {
        console.error("Supabase auth ban failed:", e?.message);
    }
}

async function unbanSupabaseUser(id) {
    try {
        const sb = createAdminClient();
        await sb.auth.admin.updateUserById(id, {
            ban_duration: "none",
        });
    } catch (e) {
        console.error("Supabase auth unban failed:", e?.message);
    }
}

// PATCH /api/admin/users  body: { id, role }
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
    const role = normalizeSafeText(body.role, { maxLength: 20 });
    const action = normalizeSafeText(body.action, { maxLength: 40 });
    if (!id || (action !== "reactivate" && !VALID_ROLES.includes(role))) {
        return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }

    const { select } = await getSafeUserQueryConfig();
    if (action === "reactivate") {
        const existing = await prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true },
        });

        if (!existing) {
            return Response.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
        }

        const updated = await prisma.$transaction((tx) =>
            reactivateUserAccount(tx, {
                userId: id,
                adminId: admin.id,
                auditDetails: {
                    userEmail: existing.email,
                },
                select,
            })
        );

        await unbanSupabaseUser(id);

        return Response.json({
            ok: true,
            user: {
                id: updated.id,
                role: updated.role,
                disabledAt: updated.disabledAt ?? null,
            },
        });
    }

    const result = await prisma.user.updateMany({
        where: { id },
        data: { role },
    });

    if (result.count === 0) {
        return Response.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
    }

    const updated = await prisma.user.findUnique({
        where: { id },
        select,
    });

    return Response.json({ ok: true, user: { id: updated.id, role: updated.role } });
}

// DELETE /api/admin/users  body: { id }
export async function DELETE(request) {
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
        return Response.json({ error: "ID fehlt." }, { status: 400 });
    }
    if (id === admin.id) {
        return Response.json(
            { error: "Du kannst dich nicht selbst löschen." },
            { status: 400 }
        );
    }

    const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, disabledAt: true },
    });

    if (!existing) {
        return Response.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
    }

    const disabledAt = existing.disabledAt ?? new Date();
    await prisma.$transaction((tx) =>
        disableUserAccount(tx, {
            userId: id,
            adminId: admin.id,
            disabledAt,
            eventCancellationReason: "Account deaktiviert",
            auditDetails: {
                userEmail: existing.email,
            },
        })
    );

    await banSupabaseUser(id);

    return Response.json({ ok: true, disabledAt: disabledAt.toISOString() });
}
