import { randomBytes } from "crypto";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    isValidEmail,
    normalizeEmail,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/server";
import { getSafeUserQueryConfig, selectExistingUserFields } from "@/lib/user-schema";
import {
    disableUserAccount,
    reactivateUserAccount,
} from "@/lib/user-deactivation";

function createTemporaryPassword() {
    return `${randomBytes(12).toString("base64url")}Aa1!`;
}

function serializeOrganizer(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        disabledAt: user.disabledAt?.toISOString?.() ?? user.disabledAt ?? null,
        createdAt: user.createdAt?.toISOString?.() ?? user.createdAt ?? null,
        events: user._count?.events ?? 0,
        organizations: user._count?.organizations ?? 0,
        venues: user._count?.venues ?? 0,
    };
}

async function requireAdmin() {
    const admin = await requireRole("ADMIN");
    if (!admin) {
        return null;
    }

    return admin;
}

async function banSupabaseUser(id) {
    const supabase = createAdminClient();
    await supabase.auth.admin
        .updateUserById(id, {
            ban_duration: "876000h",
        })
        .catch((error) => {
            console.error("Supabase auth ban failed:", error?.message);
        });
}

async function unbanSupabaseUser(id) {
    const supabase = createAdminClient();
    await supabase.auth.admin
        .updateUserById(id, {
            ban_duration: "none",
        })
        .catch((error) => {
            console.error("Supabase auth unban failed:", error?.message);
        });
}

export async function POST(request) {
    const admin = await requireAdmin();
    if (!admin) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 403 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const email = normalizeEmail(body.email);
    const name = normalizeSafeText(body.name, { maxLength: 120 }) || null;
    const suppliedPassword = String(body.password ?? "");
    const password =
        suppliedPassword.length >= 8 && suppliedPassword.length <= 200
            ? suppliedPassword
            : createTemporaryPassword();

    if (!isValidEmail(email) || !name) {
        return Response.json(
            { error: "Bitte Name und gültige E-Mail angeben." },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: "ORGANIZER" },
    });

    if (error || !data.user) {
        return Response.json(
            { error: error?.message || "Veranstalter konnte nicht erstellt werden." },
            { status: 400 }
        );
    }

    try {
        const { select } = await getSafeUserQueryConfig();
        const createData = await selectExistingUserFields({
            id: data.user.id,
            email,
            name,
            role: "ORGANIZER",
            preferredPaymentMethod: "STRIPE",
            billingCountry: "DE",
        });

        const organizer = await prisma.user.upsert({
            where: { id: data.user.id },
            update: {
                email,
                name,
                role: "ORGANIZER",
                disabledAt: null,
                disabledById: null,
                disabledReason: null,
            },
            create: createData,
            select: {
                ...select,
                createdAt: true,
                _count: { select: { events: true, organizations: true, venues: true } },
            },
        });

        await prisma.eventAuditLog.create({
            data: {
                actorId: admin.id,
                action: "admin.organizer.created",
                details: {
                    organizerId: organizer.id,
                    organizerEmail: organizer.email,
                },
            },
        });

        return Response.json({
            ok: true,
            organizer: serializeOrganizer(organizer),
            credentials: {
                email,
                password,
            },
        });
    } catch (error) {
        await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
        throw error;
    }
}

export async function PATCH(request) {
    const admin = await requireAdmin();
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
    const name = normalizeSafeText(body.name, { maxLength: 120 });
    const action = normalizeSafeText(body.action, { maxLength: 40 });

    if (!id || (!name && action !== "reactivate")) {
        return Response.json({ error: "Name fehlt." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, email: true },
    });

    if (!existing || existing.role !== "ORGANIZER") {
        return Response.json({ error: "Veranstalter nicht gefunden." }, { status: 404 });
    }

    const { select } = await getSafeUserQueryConfig();
    if (action === "reactivate") {
        const organizer = await prisma.$transaction((tx) =>
            reactivateUserAccount(tx, {
                userId: id,
                adminId: admin.id,
                auditAction: "admin.organizer.reactivated",
                auditDetails: {
                    organizerId: id,
                    organizerEmail: existing.email,
                },
                select: {
                    ...select,
                    createdAt: true,
                    _count: { select: { events: true, organizations: true, venues: true } },
                },
            })
        );

        await unbanSupabaseUser(id);

        return Response.json({ ok: true, organizer: serializeOrganizer(organizer) });
    }

    const organizer = await prisma.user.update({
        where: { id },
        data: { name },
        select: {
            ...select,
            createdAt: true,
            _count: { select: { events: true, organizations: true, venues: true } },
        },
    });

    const supabase = createAdminClient();
    await supabase.auth.admin
        .updateUserById(id, {
            user_metadata: { name, role: "ORGANIZER" },
        })
        .catch(() => {});

    await prisma.eventAuditLog.create({
        data: {
            actorId: admin.id,
            action: "admin.organizer.renamed",
            details: {
                organizerId: id,
                organizerEmail: existing.email,
                name,
            },
        },
    });

    return Response.json({ ok: true, organizer: serializeOrganizer(organizer) });
}

export async function DELETE(request) {
    const admin = await requireAdmin();
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
        select: { id: true, email: true, role: true, disabledAt: true },
    });

    if (!existing || existing.role !== "ORGANIZER") {
        return Response.json({ error: "Veranstalter nicht gefunden." }, { status: 404 });
    }

    const disabledAt = existing.disabledAt ?? new Date();
    const { select } = await getSafeUserQueryConfig();
    const organizer = await prisma.$transaction((tx) =>
        disableUserAccount(tx, {
            userId: id,
            adminId: admin.id,
            disabledAt,
            eventCancellationReason: "Veranstalter deaktiviert",
            auditAction: "admin.organizer.disabled",
            auditDetails: {
                organizerId: id,
                organizerEmail: existing.email,
            },
            select: {
                ...select,
                createdAt: true,
                _count: { select: { events: true, organizations: true, venues: true } },
            },
        })
    );

    await banSupabaseUser(id);

    return Response.json({ ok: true, organizer: serializeOrganizer(organizer) });
}
