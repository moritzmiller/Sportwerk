import {
    isBotTrapTriggered,
    isValidEmail,
    normalizeEmail,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/env";
import { isMailNotConfiguredError, passwordResetRedirectTo } from "@/lib/auth-email-links";
import { createPasswordResetToken } from "@/lib/password-reset-tokens";
import { sendPasswordResetEmail } from "@/lib/mail";
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

function okResponse(mailSent = false, mailProvider = null) {
    return Response.json({
        ok: true,
        mailSent,
        mailProvider,
        message:
            "Wenn ein Konto existiert und der Mailversand aktiv ist, wurde ein Reset-Link vorbereitet.",
    });
}

function canExposeDevelopmentResetLink() {
    return process.env.NODE_ENV !== "production";
}

function developmentResetLinkResponse(resetUrl) {
    return Response.json({
        ok: true,
        mailSent: false,
        mailProvider: "development-link",
        resetUrl,
        message:
            "Mailversand ist lokal nicht konfiguriert. Nutze den Entwicklungslink zum Zuruecksetzen.",
    });
}

async function findResetMailUser(email) {
    try {
        const profile = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                name: true,
                disabledAt: true,
            },
        });

        if (!profile || profile.disabledAt) {
            return null;
        }

        return {
            id: profile.id,
            email: profile.email,
            name: profile.name,
        };
    } catch (error) {
        console.error("[Password reset] Profile lookup failed:", error);
        await logSystemEvent({
            area: "auth",
            message: "Password reset profile lookup failed.",
            details: error,
        });
        throw error;
    }
}

export async function POST(request) {
    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    if (isBotTrapTriggered(body)) {
        return okResponse(false);
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return okResponse(false);
    }

    const rateLimit = await checkPersistentRateLimit({
        key: buildRateLimitKey("auth:password-reset", getClientIp(request), email),
        limit: 12,
        windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return rateLimitResponse(
            "Zu viele Reset-Anfragen in kurzer Zeit. Bitte warte kurz und versuche es erneut.",
            rateLimit
        );
    }

    try {
        const user = await findResetMailUser(email);
        if (!user) {
            return okResponse(false, "gatekeeper");
        }

        const resetToken = createPasswordResetToken({
            userId: user.id,
            email: user.email,
        });
        const resetUrl = `${passwordResetRedirectTo(getBaseUrl(request))}?token=${encodeURIComponent(resetToken)}`;

        try {
            const mail = await sendPasswordResetEmail(user, resetUrl);
            return okResponse(true, mail?.provider || "gatekeeper");
        } catch (mailError) {
            if (isMailNotConfiguredError(mailError) && canExposeDevelopmentResetLink()) {
                return developmentResetLinkResponse(resetUrl);
            }

            throw mailError;
        }
    } catch (error) {
        console.error("[Password reset] Mail failed:", error);
        await logSystemEvent({
            area: "auth",
            message: "Password reset failed.",
            details: error,
        });
        return Response.json(
            {
                error:
                    "Reset-Link konnte nicht vorbereitet werden. Bitte GateKeeper Mail-Konfiguration pruefen.",
            },
            { status: 503 }
        );
    }
}
