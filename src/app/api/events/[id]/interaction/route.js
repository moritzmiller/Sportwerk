import { getCurrentUser } from "@/lib/auth";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    getClientIp,
    rateLimitResponse,
} from "@/lib/persistent-rate-limit";
import { prisma } from "@/lib/prisma";
import { recordEventInteraction } from "@/lib/recommendations";
import {
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

const ALLOWED_INTERACTIONS = new Set(["CLICK", "SHARE", "HIDE", "DWELL"]);

export async function POST(request, { params }) {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        return Response.json({ error: "Ungultige Event-ID." }, { status: 400 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 12 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const type = String(body.type || "CLICK").toUpperCase();
    if (!ALLOWED_INTERACTIONS.has(type)) {
        return Response.json({ error: "Ungultige Interaktion." }, { status: 400 });
    }

    const user = await getCurrentUser().catch(() => null);
    const rateLimit = await checkPersistentRateLimit({
        key: buildRateLimitKey(
            "events:interaction",
            getClientIp(request),
            user?.id ?? "anonymous",
            id,
            type
        ),
        limit: user ? 90 : 30,
        windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
        return rateLimitResponse(
            "Zu viele Event-Interaktionen. Bitte warte kurz und versuche es erneut.",
            rateLimit
        );
    }

    const metadata = {
        rank: Number.isFinite(Number(body.rank)) ? Number(body.rank) : null,
        variant: body.variant ? normalizeSafeText(body.variant, { maxLength: 40 }) : null,
    };
    const interaction = await recordEventInteraction(prisma, {
        userId: user?.id ?? null,
        eventId: id,
        type,
        source: body.source
            ? normalizeSafeText(body.source, { maxLength: 80 })
            : "event-card",
        metadata,
    });

    if (!interaction) {
        return Response.json({ error: "Event nicht gefunden." }, { status: 404 });
    }

    return Response.json({ ok: true });
}
