import { validateEnv, getAppUrl } from "./env.js";
import { isValidEmail, normalizeEmail } from "./security.js";

function authCheck(id, label, status, message, details = []) {
    return { id, label, status, message, details };
}

function formatNullableDate(value) {
    return value ? new Date(value).toISOString() : null;
}

function summarizeSupabaseUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        email: user.email ?? null,
        emailConfirmedAt: formatNullableDate(user.email_confirmed_at),
        confirmedAt: formatNullableDate(user.confirmed_at),
        lastSignInAt: formatNullableDate(user.last_sign_in_at),
        bannedUntil: formatNullableDate(user.banned_until),
        providers: Array.isArray(user.identities)
            ? user.identities.map((identity) => identity.provider).filter(Boolean)
            : [],
    };
}

async function loadRuntimeClients({ prismaClient, supabaseAdminClient } = {}) {
    const clients = {};

    if (prismaClient) {
        clients.prisma = prismaClient;
    } else {
        const { prisma } = await import("./prisma.js");
        clients.prisma = prisma;
    }

    if (supabaseAdminClient) {
        clients.supabaseAdmin = supabaseAdminClient;
    } else {
        const { createAdminClient } = await import("@/lib/supabase/server");
        clients.supabaseAdmin = createAdminClient();
    }

    return clients;
}

async function findSupabaseUserByProfileId(supabaseAdmin, profile) {
    if (!profile?.id) return { user: null, error: null };

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    return { user: data?.user ?? null, error };
}

export async function buildAuthDiagnostics({
    email = "",
    request = null,
    env = process.env,
    prismaClient,
    supabaseAdminClient,
} = {}) {
    const normalizedEmail = normalizeEmail(email);
    const hasEmail = normalizedEmail.length > 0;
    const envResult = validateEnv(env);
    const baseUrl = getAppUrl(request, env);
    const checks = [];

    checks.push(
        authCheck(
            "supabase-public",
            "Supabase Public Auth",
            envResult.config.supabase.configured ? "ok" : "error",
            envResult.config.supabase.configured
                ? "NEXT_PUBLIC_SUPABASE_URL und Anon Key sind gesetzt."
                : "NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt."
        )
    );

    checks.push(
        authCheck(
            "supabase-admin",
            "Supabase Admin Auth",
            envResult.config.supabase.adminConfigured ? "ok" : "warning",
            envResult.config.supabase.adminConfigured
                ? "Service Role Key ist für geschützte Admin-Diagnosen gesetzt."
                : "SUPABASE_SERVICE_ROLE_KEY fehlt; Account-Details können nicht geprüft werden."
        )
    );

    checks.push(
        authCheck(
            "redirects",
            "Auth Redirects",
            envResult.config.appUrl ? "ok" : "warning",
            `Aktuelle Auth-Basis: ${baseUrl}`,
            [`Login/Bestaetigung: ${baseUrl}/auth`, `Passwort-Reset: ${baseUrl}/auth/reset-password`]
        )
    );

    if (!hasEmail) {
        return {
            ok: checks.every((check) => check.status !== "error"),
            email: null,
            checks,
            account: null,
        };
    }

    if (!isValidEmail(normalizedEmail)) {
        checks.push(
            authCheck(
                "email",
                "E-Mail",
                "error",
                "Die eingegebene E-Mail-Adresse ist ungueltig."
            )
        );
        return {
            ok: false,
            email: normalizedEmail,
            checks,
            account: null,
        };
    }

    if (!envResult.config.supabase.adminConfigured) {
        checks.push(
            authCheck(
                "account",
                "Account",
                "warning",
                "Account-Diagnose übersprungen, weil SUPABASE_SERVICE_ROLE_KEY fehlt."
            )
        );
        return {
            ok: checks.every((check) => check.status !== "error"),
            email: normalizedEmail,
            checks,
            account: null,
        };
    }

    const { prisma, supabaseAdmin } = await loadRuntimeClients({
        prismaClient,
        supabaseAdminClient,
    });

    const profile = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            disabledAt: true,
            disabledReason: true,
        },
    });

    checks.push(
        authCheck(
            "app-profile",
            "GateKeeper Profil",
            profile ? (profile.disabledAt ? "error" : "ok") : "warning",
            profile
                ? profile.disabledAt
                    ? "GateKeeper-Profil ist deaktiviert."
                    : "GateKeeper-Profil wurde gefunden."
                : "Kein GateKeeper-Profil für diese E-Mail gefunden."
        )
    );

    const { user: supabaseUser, error } = await findSupabaseUserByProfileId(
        supabaseAdmin,
        profile
    );

    if (error) {
        checks.push(
            authCheck(
                "supabase-account",
                "Supabase Account",
                "error",
                "Supabase-Account konnte nicht gelesen werden.",
                [error.message || "Unbekannter Supabase-Fehler"]
            )
        );
    } else if (!supabaseUser) {
        checks.push(
            authCheck(
                "supabase-account",
                "Supabase Account",
                "error",
                profile
                    ? "GateKeeper-Profil zeigt auf keinen vorhandenen Supabase-Auth-User."
                    : "Ohne GateKeeper-Profil kann kein Supabase-User eindeutig zugeordnet werden."
            )
        );
    } else {
        const confirmed = Boolean(supabaseUser.email_confirmed_at || supabaseUser.confirmed_at);
        const banned = Boolean(supabaseUser.banned_until);
        checks.push(
            authCheck(
                "supabase-account",
                "Supabase Account",
                confirmed && !banned ? "ok" : "error",
                confirmed
                    ? banned
                        ? "Supabase-Account ist gesperrt."
                        : "Supabase-Account ist vorhanden und bestaetigt."
                    : "Supabase-Account ist vorhanden, aber noch nicht bestaetigt."
            )
        );
    }

    const account = {
        gatekeeperProfile: profile
            ? {
                  id: profile.id,
                  email: profile.email,
                  name: profile.name,
                  role: profile.role,
                  disabledAt: formatNullableDate(profile.disabledAt),
                  disabledReason: profile.disabledReason ?? null,
              }
            : null,
        supabaseUser: summarizeSupabaseUser(supabaseUser),
    };

    return {
        ok: checks.every((check) => check.status !== "error"),
        email: normalizedEmail,
        checks,
        account,
    };
}
