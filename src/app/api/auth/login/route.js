import { createClient } from "@/lib/supabase/server";
import {
    isBotTrapTriggered,
    isValidEmail,
    normalizeEmail,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { attachOrCreateUserProfile } from "@/lib/auth-profile";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    getClientIp,
    rateLimitResponse,
} from "@/lib/persistent-rate-limit";
import { logSystemEvent } from "@/lib/system-events";

function isSupabaseConfigMissing(error) {
    return error?.code === "SUPABASE_PUBLIC_CONFIG_MISSING";
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

function loginErrorResponse(error, status = 401, code = "AUTH_LOGIN_FAILED") {
    return Response.json({ error, code }, { status });
}

function mapSupabaseLoginError(error) {
    const message = String(error?.message ?? "");
    const lower = message.toLowerCase();

    if (/confirm|verified|not confirmed/i.test(message)) {
        return {
            status: 401,
            code: "AUTH_EMAIL_NOT_CONFIRMED",
            error: "Bitte bestaetige zuerst deine E-Mail-Adresse.",
        };
    }

    if (
        error?.code === "invalid_credentials" ||
        lower.includes("invalid login credentials") ||
        lower.includes("invalid credentials")
    ) {
        return {
            status: 401,
            code: "AUTH_PASSWORD_INVALID",
            error: "Das Passwort ist falsch. Bitte pruefe dein Passwort oder setze es zurueck.",
        };
    }

    if (error?.status === 429 || lower.includes("rate limit") || lower.includes("too many")) {
        return {
            status: 429,
            code: "AUTH_LOGIN_RATE_LIMITED",
            error: "Zu viele Anmeldeversuche. Bitte warte kurz und versuche es erneut.",
        };
    }

    return {
        status: 401,
        code: "AUTH_LOGIN_FAILED",
        error: "Anmeldung fehlgeschlagen. Bitte pruefe deine Eingaben.",
    };
}

// POST /api/auth/login
// body: { email, password }
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

    if (isBotTrapTriggered(body)) {
        return loginErrorResponse("Anmeldung fehlgeschlagen.", 400);
    }

    if (!isValidEmail(email) || !password || password.length > 200) {
        return loginErrorResponse("E-Mail und Passwort sind erforderlich.", 400, "AUTH_INPUT_REQUIRED");
    }

    const rateLimit = await checkPersistentRateLimit({
        key: buildRateLimitKey("auth:login", getClientIp(request), email),
        limit: 8,
        windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return rateLimitResponse(
            "Zu viele Anmeldeversuche. Bitte warte kurz und versuche es erneut.",
            rateLimit
        );
    }

    let existingProfile;
    try {
        existingProfile = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                disabledAt: true,
            },
        });
    } catch (error) {
        console.error("[Login] User lookup failed:", error);
        await logSystemEvent({
            area: "auth",
            message: "Login failed because the GateKeeper user lookup failed.",
            details: error,
        });
        return loginErrorResponse(
            "Login ist aktuell nicht erreichbar. Bitte Datenbankverbindung und Migrationen pruefen.",
            503,
            "AUTH_PROFILE_LOOKUP_FAILED"
        );
    }

    if (!existingProfile) {
        return loginErrorResponse(
            "Diese E-Mail ist noch nicht registriert.",
            404,
            "AUTH_EMAIL_NOT_REGISTERED"
        );
    }

    if (existingProfile.disabledAt) {
        return loginErrorResponse(
            "Dieses Konto wurde deaktiviert. Bitte kontaktiere den Support.",
            403,
            "AUTH_ACCOUNT_DISABLED"
        );
    }

    let supabase;
    try {
        supabase = await createClient();
    } catch (error) {
        if (isSupabaseConfigMissing(error)) {
            console.error("[Login] Supabase public config missing.");
            await logSystemEvent({
                area: "auth",
                message: "Login failed because Supabase public config is missing.",
                details: error,
            });
            return Response.json(
                {
                    error:
                        "Login ist nicht korrekt konfiguriert. Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY im Deployment setzen.",
                },
                { status: 503 }
            );
        }
        throw error;
    }

    let data;
    let error;
    try {
        const result = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        data = result.data;
        error = result.error;
    } catch (caughtError) {
        if (isSupabaseUnavailable(caughtError)) {
            console.error("[Login] Supabase auth unavailable:", caughtError);
            await logSystemEvent({
                area: "auth",
                message: "Login failed because Supabase Auth is unavailable.",
                details: caughtError,
            });
            return Response.json(
                {
                    error:
                        "Login ist aktuell nicht erreichbar. Bitte Supabase Auth und Netzwerkverbindung prÃ¼fen.",
                },
                { status: 503 }
            );
        }
        throw caughtError;
    }

    if (error) {
        const mapped = mapSupabaseLoginError(error);
        return loginErrorResponse(mapped.error, mapped.status, mapped.code);
    }

    let normalized;
    try {
        normalized = await attachOrCreateUserProfile({
            authUser: data.user,
        });
    } catch (profileError) {
        if (profileError?.code === "ACCOUNT_DISABLED") {
            await supabase.auth.signOut().catch(() => {});
            return Response.json(
                { error: "Dieses Konto wurde deaktiviert. Bitte kontaktiere den Support." },
                { status: 403 }
            );
        }

        console.error("[Login] User profile sync failed:", profileError);
        await logSystemEvent({
            area: "auth",
            message: "Login profile sync failed.",
            details: profileError,
        });
        return Response.json(
            {
                error:
                    "Anmeldung erfolgreich, aber das GateKeeper-Profil konnte nicht geladen werden. Bitte Datenbankverbindung und Migrationen prüfen.",
            },
            { status: 503 }
        );
    }

    return Response.json({
        ok: true,
        role: normalized.role,
    });
}
