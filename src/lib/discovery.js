import { CATEGORIES } from "./categories.js";

const TIME_FILTERS = new Set(["all", "today", "weekend", "week", "month"]);
const SORTS = new Set(["for-you", "popular", "date-asc", "date-desc", "price-asc", "price-desc"]);
const CATEGORY_VALUES = new Set(CATEGORIES.map((category) => category.value));
const PAGE_SIZE = 14;
const PERSONALIZED_CANDIDATE_LIMIT = 84;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function parseBoolean(value) {
    return value === true || value === "true" || value === "1";
}

function getWeekendRange(now) {
    const day = now.getDay();
    const sat = new Date(now);
    sat.setDate(now.getDate() + ((6 - day + 7) % 7));
    sat.setHours(0, 0, 0, 0);

    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    sun.setHours(23, 59, 59, 999);

    return { start: sat, end: sun };
}

function getMonthRange(now) {
    const end = new Date(now);
    end.setMonth(now.getMonth() + 1);

    return { start: now, end };
}

export function normalizeDiscoveryParams(searchParams = {}) {
    const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
    const query = normalizeText(searchParams.query ?? "");
    const rawCategory = normalizeText(searchParams.category ?? "").toUpperCase();
    const category = CATEGORY_VALUES.has(rawCategory) ? rawCategory : "all";

    const timeValue = normalizeText(searchParams.time ?? "all");
    const time = TIME_FILTERS.has(timeValue) ? timeValue : "all";

    const sortValue = normalizeText(searchParams.sort ?? "for-you");
    const sort = SORTS.has(sortValue) ? sortValue : "for-you";

    const freeOnly = parseBoolean(searchParams.freeOnly);

    return { page, query, category, time, sort, freeOnly };
}

export function buildDiscoveryWhere(filters = {}, now = new Date()) {
    const where = {
        status: "PUBLISHED",
        startDate: {
            gte: now,
        },
    };

    if (filters.category && filters.category !== "all") {
        where.category = filters.category;
    }

    if (filters.freeOnly) {
        where.price = 0;
    }

    if (filters.query) {
        where.OR = [
            { title: { contains: filters.query, mode: "insensitive" } },
            { description: { contains: filters.query, mode: "insensitive" } },
            { location: { contains: filters.query, mode: "insensitive" } },
            { city: { contains: filters.query, mode: "insensitive" } },
        ];
    }

    if (filters.time === "today") {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        where.startDate = {
            gte: now,
            lt: tomorrow,
        };
    } else if (filters.time === "weekend") {
        const { start, end } = getWeekendRange(now);

        where.startDate = {
            gte: start,
            lte: end,
        };
    } else if (filters.time === "week") {
        const end = new Date(now);
        end.setDate(now.getDate() + 7);

        where.startDate = {
            gte: now,
            lte: end,
        };
    } else if (filters.time === "month") {
        const { start, end } = getMonthRange(now);

        where.startDate = {
            gte: start,
            lte: end,
        };
    }

    return where;
}

export function buildDiscoveryFallbackWhere(filters = {}) {
    const where = {
        status: {
            in: ["PUBLISHED", "POSTPONED", "SOLD_OUT"],
        },
    };

    if (filters.category && filters.category !== "all") {
        where.category = filters.category;
    }

    if (filters.freeOnly) {
        where.price = 0;
    }

    if (filters.query) {
        where.OR = [
            { title: { contains: filters.query, mode: "insensitive" } },
            { description: { contains: filters.query, mode: "insensitive" } },
            { location: { contains: filters.query, mode: "insensitive" } },
            { city: { contains: filters.query, mode: "insensitive" } },
        ];
    }

    return where;
}

export function buildDiscoveryOrderBy(sort = "date-asc") {
    switch (sort) {
        case "for-you":
            return [{ startDate: "asc" }, { viewCount: "desc" }];

        case "date-desc":
            return [{ startDate: "desc" }];

        case "price-asc":
            return [{ price: "asc" }, { startDate: "asc" }];

        case "price-desc":
            return [{ price: "desc" }, { startDate: "asc" }];

        case "popular":
            return [{ viewCount: "desc" }, { startDate: "asc" }];

        case "date-asc":
        default:
            return [{ startDate: "asc" }];
    }
}

export function getDiscoveryPageSize() {
    return PAGE_SIZE;
}

export function getPersonalizedCandidateLimit() {
    return PERSONALIZED_CANDIDATE_LIMIT;
}

export function buildDiscoveryPageHref(basePath, filters = {}, nextPage = 1) {
    const params = new URLSearchParams();

    if (filters.query) params.set("query", filters.query);
    if (filters.category && filters.category !== "all" && CATEGORY_VALUES.has(filters.category)) {
        params.set("category", filters.category);
    }
    if (filters.time && filters.time !== "all") params.set("time", filters.time);
    if (filters.sort && filters.sort !== "for-you") params.set("sort", filters.sort);
    if (filters.freeOnly) params.set("freeOnly", "true");
    if (nextPage > 1) params.set("page", String(nextPage));

    const queryString = params.toString();
    const [path, hashFragment] = String(basePath || "/").split("#", 2);
    const hash = hashFragment ? `#${hashFragment}` : "";

    return queryString ? `${path}?${queryString}${hash}` : `${path}${hash}`;
}

function addWeight(map, key, weight) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + weight);
}

function getWeight(map, key) {
    if (!key) return 0;
    return map.get(key) || 0;
}

function normalizeScoreMap(map) {
    const max = Math.max(1, ...map.values());
    return new Map([...map.entries()].map(([key, value]) => [key, value / max]));
}

function getDaysUntil(startDate, now) {
    return Math.ceil((new Date(startDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function topMapLabel(map, fallback = null) {
    const [first] = [...map.entries()].sort((a, b) => b[1] - a[1]);
    return first?.[0] ?? fallback;
}

export function buildDiscoveryProfile({ user = null, views = [], favorites = [], bookings = [], alerts = [] } = {}) {
    const categoryWeights = new Map();
    const cityWeights = new Map();
    const locationWeights = new Map();
    let freeSignals = 0;
    let paidSignals = 0;

    for (const favorite of favorites) {
        const event = favorite.event ?? favorite;
        if (!event) continue;
        addWeight(categoryWeights, event.category, 6);
        addWeight(cityWeights, event.city, 4);
        addWeight(locationWeights, event.location, 3);
        if (Number(event.price || 0) === 0) freeSignals += 1;
        else paidSignals += 1;
    }

    for (const booking of bookings) {
        const event = booking.event ?? booking;
        if (!event) continue;
        addWeight(categoryWeights, event.category, 8);
        addWeight(cityWeights, event.city, 5);
        addWeight(locationWeights, event.location, 4);
        if (Number(event.price || 0) === 0) freeSignals += 1;
        else paidSignals += 2;
    }

    for (const view of views) {
        const event = view.event ?? view;
        if (!event) continue;
        addWeight(categoryWeights, event.category, 2);
        addWeight(cityWeights, event.city, 1.5);
        addWeight(locationWeights, event.location, 1);
    }

    for (const alert of alerts) {
        addWeight(categoryWeights, alert.category, 5);
        addWeight(cityWeights, alert.city, 4);
    }

    const normalizedCategoryWeights = normalizeScoreMap(categoryWeights);
    const normalizedCityWeights = normalizeScoreMap(cityWeights);
    const normalizedLocationWeights = normalizeScoreMap(locationWeights);
    const hasSignals =
        normalizedCategoryWeights.size > 0 ||
        normalizedCityWeights.size > 0 ||
        normalizedLocationWeights.size > 0;

    return {
        userId: user?.id ?? null,
        hasSignals,
        categoryWeights: normalizedCategoryWeights,
        cityWeights: normalizedCityWeights,
        locationWeights: normalizedLocationWeights,
        topCategory: topMapLabel(normalizedCategoryWeights),
        topCity: topMapLabel(normalizedCityWeights, "Dresden"),
        prefersFree: freeSignals > paidSignals,
    };
}

export function getDiscoveryProfileSummary(profile) {
    if (!profile?.userId) {
        return {
            title: "Trend-Feed für Dresden",
            text: "Sortiert nach Nähe, Nachfrage und verifizierten Veranstaltern.",
        };
    }

    if (!profile.hasSignals) {
        return {
            title: "Dein Feed lernt noch",
            text: "Sobald du Events ansiehst, speicherst oder buchst, wird die Auswahl persönlicher.",
        };
    }

    return {
        title: "Für dich sortiert",
        text: [
            profile.topCategory ? `mehr ${profile.topCategory.toLowerCase()}` : null,
            profile.topCity ? `in ${profile.topCity}` : null,
            profile.prefersFree ? "mit Fokus auf guenstige Optionen" : null,
        ]
            .filter(Boolean)
            .join(", "),
    };
}

function getEventScoreParts(event, profile, now) {
    const daysUntil = getDaysUntil(event.startDate, now);
    const start = new Date(event.startDate);
    const hour = start.getHours();
    const day = start.getDay();
    const isWeekendNight = (day === 5 || day === 6) && hour >= 18;
    const viewBoost = Math.log10(Number(event.viewCount || 0) + 1) * 7;
    const capacity = Number(event.capacity || 0);
    const soldTickets = Number(event.soldTickets || 0);
    const fillRate = capacity > 0 ? soldTickets / capacity : 0;
    const demandBoost = capacity > 0 ? Math.min(14, fillRate * 14) : 0;
    const urgencyBoost = daysUntil <= 0 ? 22 : daysUntil <= 1 ? 18 : daysUntil <= 7 ? 12 : daysUntil <= 30 ? 5 : 0;
    const nightBoost = isWeekendNight ? 5 : hour >= 18 ? 3 : 0;
    const verifiedBoost =
        event.organizationVerificationStatus === "VERIFIED" ||
        event.venueVerificationStatus === "VERIFIED"
            ? 5
            : 0;
    const categoryBoost = getWeight(profile.categoryWeights, event.category) * 26;
    const cityBoost = getWeight(profile.cityWeights, event.city) * 18;
    const locationBoost = getWeight(profile.locationWeights, event.location) * 10;
    const freeBoost = profile.prefersFree && Number(event.price || 0) === 0 ? 8 : 0;
    const anonymousBaseline = profile.hasSignals ? 0 : 9;
    const serendipityBoost =
        profile.hasSignals &&
        categoryBoost === 0 &&
        viewBoost >= 4 &&
        daysUntil <= 14
            ? 5
            : 0;

    return {
        score:
            categoryBoost +
            cityBoost +
            locationBoost +
            freeBoost +
            urgencyBoost +
            nightBoost +
            viewBoost +
            demandBoost +
            verifiedBoost +
            anonymousBaseline +
            serendipityBoost,
        categoryBoost,
        cityBoost,
        locationBoost,
        freeBoost,
        urgencyBoost,
        nightBoost,
        viewBoost,
        demandBoost,
        verifiedBoost,
        serendipityBoost,
        fillRate,
        daysUntil,
    };
}

function getPulseLabel(score, parts) {
    if (parts?.urgencyBoost >= 18) return "Heute heiss";
    if (parts?.demandBoost >= 9) return "zieht an";
    if (score >= 55) return "Top-Match";
    if (score >= 38) return "stark";
    return "neu";
}

function getMatchReasons(event, profile, now, parts) {
    const reasons = [];
    const daysUntil = parts?.daysUntil ?? getDaysUntil(event.startDate, now);

    if (getWeight(profile.categoryWeights, event.category) > 0.35) {
        reasons.push("dein Muster");
    }

    if (getWeight(profile.cityWeights, event.city) > 0.35) {
        reasons.push(event.city);
    }

    if (profile.prefersFree && Number(event.price || 0) === 0) {
        reasons.push("kostenlos");
    }

    if (daysUntil <= 1) {
        reasons.push("heute");
    } else if (daysUntil <= 7) {
        reasons.push("diese Woche");
    }

    if (parts?.fillRate >= 0.75) {
        reasons.push("fast voll");
    } else if (Number(event.viewCount || 0) >= 10) {
        reasons.push("viel gesehen");
    }

    if (parts?.nightBoost >= 5) {
        reasons.push("Wochenendnacht");
    }

    if (
        event.organizationVerificationStatus === "VERIFIED" ||
        event.venueVerificationStatus === "VERIFIED"
    ) {
        reasons.push("trusted");
    }

    if (reasons.length === 0) {
        reasons.push(profile.hasSignals ? "Wildcard" : "lokal");
    }

    return reasons.slice(0, 3);
}

export function rankDiscoveryEvents(events, profile, now = new Date()) {
    return [...events]
        .map((event) => {
            const parts = getEventScoreParts(event, profile, now);
            const score = Math.round(parts.score);

            return {
                ...event,
                matchScore: score,
                pulseScore: Math.max(18, Math.min(99, score + 24)),
                pulseLabel: getPulseLabel(score, parts),
                matchReasons: getMatchReasons(event, profile, now, parts),
            };
        })
        .sort((a, b) => {
            const scoreDelta = Number(b.matchScore || 0) - Number(a.matchScore || 0);
            if (scoreDelta !== 0) return scoreDelta;
            return new Date(a.startDate) - new Date(b.startDate);
        });
}
