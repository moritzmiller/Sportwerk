import { createClient } from "@/lib/supabase/server";
import { attachOrCreateUserProfile } from "@/lib/auth-profile";
import { prisma } from "@/lib/prisma";
import {
    hasPublicTable,
    isMissingPrismaTableError,
    isPrismaSchemaMismatchError,
} from "@/lib/prisma-errors";
import { isSupabasePublicConfigMissing } from "@/lib/auth-errors";

/**
 * Returns the current Supabase auth user together with the matching
 * Prisma User record (which holds the role). Returns null if not logged in.
 */
export async function getCurrentUser() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    try {
        return {
            authUser: user,
            ...(await attachOrCreateUserProfile({ authUser: user })),
        };
    } catch (error) {
        if (error?.code === "ACCOUNT_DISABLED") {
            await supabase.auth.signOut().catch(() => {});
            return null;
        }
        throw error;
    }
}

export async function getOptionalCurrentUser() {
    try {
        return await getCurrentUser();
    } catch (error) {
        if (error?.digest === "DYNAMIC_SERVER_USAGE") {
            throw error;
        }
        if (isSupabasePublicConfigMissing(error)) {
            return null;
        }
        if (isPrismaSchemaMismatchError(error)) {
            console.warn(
                "[Auth] Optional user lookup skipped because the database schema is not up to date. Run `npx prisma migrate dev`."
            );
            return null;
        }
        console.error("[Auth] Optional user lookup failed:", error);
        return null;
    }
}

export async function getCurrentUserWithErichRoles() {
    const user = await getCurrentUser();
    if (!user) return null;

    let erichRoleAssignments = [];

    try {
        const hasErichRoleAssignments = await hasPublicTable(
            prisma,
            "ErichRoleAssignment"
        );

        if (hasErichRoleAssignments) {
            erichRoleAssignments = await prisma.erichRoleAssignment.findMany({
                where: { userId: user.id },
                select: {
                    eventId: true,
                    role: true,
                },
            });
        }
    } catch (error) {
        if (!isMissingPrismaTableError(error, ["ErichRoleAssignment"])) {
            throw error;
        }

        console.warn(
            "[Auth] ERICH role table is missing. Run `npx prisma migrate dev` before using ERICH flows."
        );
    }

    return {
        ...user,
        erichRoleAssignments,
    };
}

export async function requireRole(role) {
    const user = await getCurrentUser();
    if (!user || user.role !== role) return null;
    return user;
}
