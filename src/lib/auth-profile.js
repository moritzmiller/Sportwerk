import { prisma } from "@/lib/prisma";
import {
    getSafeUserQueryConfig,
    normalizeExistingUser,
    selectExistingUserFields,
} from "@/lib/user-schema";

function normalizeRole(value, fallback = "VISITOR") {
    const role = String(value || fallback).toUpperCase();
    return ["VISITOR", "ORGANIZER", "ADMIN"].includes(role) ? role : fallback;
}

function assertUserIsActive(user) {
    if (!user?.disabledAt) return;

    const error = new Error("GateKeeper account is disabled.");
    error.code = "ACCOUNT_DISABLED";
    throw error;
}

export async function attachOrCreateUserProfile({
    authUser,
    email = authUser?.email,
    name = authUser?.user_metadata?.name ?? null,
    role = authUser?.user_metadata?.role ?? "VISITOR",
}) {
    if (!authUser?.id || !email) {
        throw new Error("authUser id and email are required.");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = normalizeRole(role);
    const { select } = await getSafeUserQueryConfig();

    const byId = await prisma.user.findUnique({
        where: { id: authUser.id },
        select,
    });

    if (byId) {
        assertUserIsActive(byId);
        const updated = await prisma.user.update({
            where: { id: authUser.id },
            data: {
                email: authUser.email || normalizedEmail,
                name: name || byId.name || null,
            },
            select,
        });
        return normalizeExistingUser(updated);
    }

    const byEmail = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select,
    });

    if (byEmail) {
        assertUserIsActive(byEmail);
        const updated = await prisma.user.update({
            where: { email: normalizedEmail },
            data: {
                id: authUser.id,
                email: authUser.email || normalizedEmail,
                name: name || byEmail.name || null,
                role: byEmail.role || normalizedRole,
            },
            select,
        });
        return normalizeExistingUser(updated);
    }

    const createData = await selectExistingUserFields({
        id: authUser.id,
        email: authUser.email || normalizedEmail,
        name,
        role: normalizedRole,
        preferredPaymentMethod: "STRIPE",
        billingCountry: "DE",
    });

    const created = await prisma.user.create({
        data: createData,
        select,
    });

    return normalizeExistingUser(created);
}
