import { getCurrentUser } from "@/lib/auth";
import {
    buildDiscoveryOrderBy,
    buildDiscoveryWhere,
    getDiscoveryPageSize,
    getPersonalizedCandidateLimit,
    normalizeDiscoveryParams,
} from "@/lib/discovery";
import { prisma } from "@/lib/prisma";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    getClientIp,
    rateLimitResponse,
} from "@/lib/persistent-rate-limit";
import {
    buildRecommendationProfile,
    rankRecommendedEvents,
} from "@/lib/recommendations";
import { normalizeSafeText } from "@/lib/security";

export const dynamic = "force-dynamic";

const RECOMMENDED_EVENT_SELECT = {
    id: true,
    title: true,
    description: true,
    imageUrl: true,
    location: true,
    city: true,
    category: true,
    status: true,
    startDate: true,
    price: true,
    capacity: true,
    soldTickets: true,
    viewCount: true,
    organizationId: true,
    venueId: true,
    organization: {
        select: {
            verificationStatus: true,
        },
    },
    venue: {
        select: {
            verificationStatus: true,
        },
    },
};

function serializeRecommendedEvent(event) {
    return {
        id: event.id,
        title: event.title,
        description: event.description,
        imageUrl: event.imageUrl,
        location: event.location,
        city: event.city,
        category: event.category,
        status: event.status ?? "PUBLISHED",
        startDate: event.startDate.toISOString(),
        price: event.price,
        capacity: event.capacity ?? null,
        soldTickets: event.soldTickets ?? 0,
        viewCount: event.viewCount ?? 0,
        organizationId: event.organizationId ?? null,
        venueId: event.venueId ?? null,
        organizationVerificationStatus: event.organization?.verificationStatus ?? null,
        venueVerificationStatus: event.venue?.verificationStatus ?? null,
    };
}

async function loadRecommendationProfile(user) {
    if (!user) {
        return buildRecommendationProfile();
    }

    const [views, favorites, bookings, alerts, preferences] = await Promise.all([
        prisma.eventView.findMany({
            where: { userId: user.id },
            orderBy: { viewedAt: "desc" },
            take: 50,
            include: {
                event: {
                    select: {
                        category: true,
                        city: true,
                        location: true,
                        price: true,
                    },
                },
            },
        }),
        prisma.eventFavorite.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
                event: {
                    select: {
                        category: true,
                        city: true,
                        location: true,
                        price: true,
                    },
                },
            },
        }),
        prisma.booking.findMany({
            where: {
                OR: [
                    { attendeeId: user.id },
                    {
                        purchaserEmail: {
                            equals: user.email,
                            mode: "insensitive",
                        },
                    },
                ],
            },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
                event: {
                    select: {
                        category: true,
                        city: true,
                        location: true,
                        price: true,
                    },
                },
            },
        }),
        prisma.eventAlert.findMany({
            where: { userId: user.id, active: true },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                category: true,
                city: true,
            },
        }),
        prisma.userEventPreference?.findMany
            ? prisma.userEventPreference.findMany({
                where: { userId: user.id },
                orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
                take: 120,
                select: {
                    scope: true,
                    target: true,
                    weight: true,
                },
            })
            : [],
    ]);

    return buildRecommendationProfile({ user, views, favorites, bookings, alerts, preferences });
}

async function recordImpressions({ user, events, source, feedSessionId }) {
    if (!events.length || !prisma.eventImpression?.createMany) return;

    await prisma.eventImpression.createMany({
        data: events.map((event, index) => ({
            userId: user?.id ?? null,
            eventId: event.id,
            source,
            feedSessionId,
            position: index + 1,
            context: {
                matchScore: event.matchScore ?? null,
                recommendationScore: event.recommendationScore ?? null,
            },
        })),
    });
}

export async function GET(request) {
    const url = new URL(request.url);
    const filters = normalizeDiscoveryParams(Object.fromEntries(url.searchParams.entries()));
    const source = normalizeSafeText(url.searchParams.get("source") || "recommended-api", {
        maxLength: 80,
    });
    const record = url.searchParams.get("recordImpressions") === "true";
    const now = new Date();
    const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || getDiscoveryPageSize()));
    const skip = (filters.page - 1) * pageSize;
    const user = await getCurrentUser().catch(() => null);

    if (record) {
        const rateLimit = await checkPersistentRateLimit({
            key: buildRateLimitKey(
                "recommendations:impressions",
                getClientIp(request),
                user?.id ?? "anonymous",
                source
            ),
            limit: user ? 120 : 40,
            windowMs: 60 * 1000,
        });

        if (!rateLimit.allowed) {
            return rateLimitResponse(
                "Zu viele Feed-Aktualisierungen. Bitte warte kurz und versuche es erneut.",
                rateLimit
            );
        }
    }

    const profile = await loadRecommendationProfile(user).catch(() => buildRecommendationProfile({ user }));
    const where = buildDiscoveryWhere(filters, now);
    const candidates = await prisma.event.findMany({
        where,
        orderBy: buildDiscoveryOrderBy(filters.sort),
        skip: 0,
        take: Math.max(pageSize, Math.min(getPersonalizedCandidateLimit(), skip + pageSize)),
        select: RECOMMENDED_EVENT_SELECT,
    });
    const ranked = rankRecommendedEvents(candidates.map(serializeRecommendedEvent), profile, now);
    const events = ranked.slice(skip, skip + pageSize);
    const feedSessionId = crypto.randomUUID();

    if (record) {
        await recordImpressions({ user, events, source, feedSessionId }).catch((error) => {
            console.error("[Recommendations] Impression logging failed:", error);
        });
    }

    return Response.json({
        ok: true,
        feedSessionId,
        personalized: Boolean(user && profile.hasSignals),
        profileSummary: profile.profileSummary,
        events,
        page: filters.page,
        pageSize,
    });
}
