import {
    isBotTrapTriggered,
    isValidEmail,
    normalizeEmail,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/env";
import { attachOrCreateUserProfile } from "@/lib/auth-profile";
import { getGeneratedAuthActionLink, isAuthEmailRateLimit } from "@/lib/auth-email-links";
import { sendAccountVerificationEmail } from "@/lib/mail";
import {
    claimErichGuestSessionForUser,
    getErichGuestToken,
} from "@/lib/erich/guest-session";
import { prisma } from "@/lib/prisma";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    getClientIp,
    rateLimitResponse,
} from "@/lib/persistent-rate-limit";
import { logSystemEvent } from "@/lib/system-events";

function getBaseUrl(request) {
    return getAppUrl(request);
}

function isSupabaseConfigMissing(error) {
    return (
        error?.code === "SUPABASE_PUBLIC_CONFIG_MISSING" ||
        error?.code === "SUPABASE_ADMIN_CONFIG_MISSING"
    );
}

function isSupabaseUnavailable(error) {
    const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
    return (
        error?.name === "AggregateError" ||
        text.includes("fetch failed") ||
        text.includes("network") ||
        text.includes("econnrefused") ||
        text.includes("enotfound") ||
        text.includes("etimedout")
    );
}

function isAlreadyRegistered(error) {
    return /already been registered|already exists|already registered|user already/i.test(
        error?.message || ""
    );
}

function normalizeRegistrationRole(value) {
    const role = String(value || "VISITOR").trim().toUpperCase();
    return role === "ORGANIZER" ? "ORGANIZER" : "VISITOR";
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

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const name = normalizeSafeText(body.name, { maxLength: 120 }) || null;
    const role = normalizeRegistrationRole(body.role);
    const shouldClaimErichGuest = Boolean(body.claimErichGuestSession);

    if (isBotTrapTriggered(body)) {
        return Response.json({ error: "Registrierung fehlgeschlagen." }, { status: 400 });
    }

    if (!isValidEmail(email) || password.length < 8 || password.length > 200) {
        return Response.json(
            { error: "Bitte eine gueltige E-Mail und ein Passwort ab 8 Zeichen verwenden." },
            { status: 400 }
        );
    }

    const rateLimit = await checkPersistentRateLimit({
        key: buildRateLimitKey("auth:register", getClientIp(request), email),
        limit: 10,
        windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return rateLimitResponse(
            "Zu viele Registrierungsversuche. Bitte warte kurz und versuche es erneut.",
            rateLimit
        );
    }

    const baseUrl = getBaseUrl(request);
    let data;
    try {
        const supabase = createAdminClient();
        const result = await supabase.auth.admin.generateLink({
            type: "signup",
            email,
            password,
            options: {
                data: { name, role },
                redirectTo: `${baseUrl}/auth`,
            },
        });

        if (result.error) {
            throw result.error;
        }

        data = result.data;
    } catch (error) {
        if (isSupabaseConfigMissing(error)) {
            console.error("[Register] Supabase admin config missing.");
            await logSystemEvent({
                area: "auth",
                message: "Registration failed because Supabase admin config is missing.",
                details: error,
            });
            return Response.json(
                {
                    error:
                        "Registrierung ist nicht korrekt konfiguriert. Bitte Supabase URL, Anon Key und Service Role Key im Deployment setzen.",
                },
                { status: 503 }
            );
        }

        if (isSupabaseUnavailable(error)) {
            console.error("[Register] Supabase auth unavailable:", error);
            await logSystemEvent({
                area: "auth",
                message: "Registration failed because Supabase Auth is unavailable.",
                details: error,
            });
            return Response.json(
                {
                    error:
                        "Registrierung ist aktuell nicht erreichbar. Bitte Supabase Auth und Netzwerkverbindung pruefen.",
                },
                { status: 503 }
            );
        }

        if (isAlreadyRegistered(error)) {
            return Response.json(
                {
                    error:
                        "Diese E-Mail ist bereits registriert. Bitte melde dich an oder setze dein Passwort zurueck.",
                },
                { status: 409 }
            );
        }

        if (isAuthEmailRateLimit(error)) {
            return Response.json(
                {
                    error:
                        "Es wurden zu viele Registrierungslinks vorbereitet. Bitte warte kurz und versuche es erneut.",
                },
                { status: 429 }
            );
        }

        console.error("[Register] Signup link generation failed:", error);
        await logSystemEvent({
            area: "auth",
            message: "Signup link generation failed.",
            details: error,
        });
        return Response.json({ error: "Registrierung fehlgeschlagen." }, { status: 400 });
    }

    const authUser = data?.user;
    const verificationUrl = getGeneratedAuthActionLink(data);
    if (!authUser?.id || !verificationUrl) {
        return Response.json(
            { error: "Registrierung fehlgeschlagen. Aktivierungslink konnte nicht erstellt werden." },
            { status: 503 }
        );
    }

    let user = { email, name, role };
    let erichGuestClaim = null;
    try {
        user = await attachOrCreateUserProfile({
            authUser,
            email,
            name,
            role,
        });

        if (shouldClaimErichGuest) {
            erichGuestClaim = await claimErichGuestSessionForUser(prisma, {
                token: await getErichGuestToken(),
                user,
            });
        }
    } catch (error) {
        console.error("[Register] User profile creation failed after signup link:", error);
        await logSystemEvent({
            area: "auth",
            message: "User profile creation failed after registration.",
            details: error,
        });
    }

    let mail;
    try {
        mail = await sendAccountVerificationEmail(
            {
                email,
                name,
            },
            verificationUrl
        );
    } catch (error) {
        console.error("[Register] GateKeeper verification mail failed:", error);
        await logSystemEvent({
            area: "auth",
            message: "GateKeeper verification mail failed.",
            details: error,
        });
        return Response.json(
            {
                error:
                    "Konto wurde vorbereitet, aber die Aktivierungs-Mail konnte nicht versendet werden. Bitte GateKeeper Mail-Konfiguration pruefen.",
            },
            { status: 503 }
        );
    }

    return Response.json({
        ok: true,
        needsConfirmation: true,
        mailSent: true,
        mailProvider: mail?.provider || "gatekeeper",
        role: user.role ?? role,
        erichGuestClaim,
    });
}
