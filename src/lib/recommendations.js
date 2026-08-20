import {
    buildDiscoveryProfile,
    getDiscoveryProfileSummary,
    rankDiscoveryEvents,
} from "./discovery.js";

const POSITIVE_INTERACTION_WEIGHTS = {
    VIEW: 1,
    CLICK: 2,
    DWELL: 3,
    SHARE: 4,
    ALERT: 5,
    FAVORITE: 7,
    BOOKING: 10,
};

const NEGATIVE_INTERACTION_WEIGHTS = {
    UNFAVORITE: -3,
    HIDE: -8,
};

const PREFERENCE_SCOPES = new Set([
    "CATEGORY",
    "CITY",
    "LOCATION",
    "PRICE_BAND",
    "TIME_SLOT",
    "ORGANIZATION",
    "VENUE",
]);

function addWeight(map, key, weight) {
    if (!key || !Number.isFinite(weight) || weight === 0) return;
    map.set(key, (map.get(key) || 0) + weight);
}

function getWeight(map, key) {
    if (!key) return 0;
    return map?.get(key) || 0;
}

function getNegativeWeight(map, key) {
    return Math.min(0, getWeight(map, key));
}

function normalizeScoreMap(map) {
    const max = Math.max(1, ...[...map.values()].map((value) => Math.abs(value)));
    return new Map([...map.entries()].map(([key, value]) => [key, value / max]));
}

function cloneMap(map) {
    return new Map(map ? [...map.entries()] : []);
}

export function getInteractionWeight(type, explicitWeight = null) {
    if (explicitWeight !== null && explicitWeight !== undefined && Number.isFinite(Number(explicitWeight))) {
        return Number(explicitWeight);
    }

    return POSITIVE_INTERACTION_WEIGHTS[type] ?? NEGATIVE_INTERACTION_WEIGHTS[type] ?? 0;
}

export function getPriceBand(price) {
    const amount = Number(price || 0);
    if (amount <= 0) return "FREE";
    if (amount <= 10) return "LOW";
    if (amount <= 25) return "MID";
    return "PREMIUM";
}

export function getTimeSlot(startDate) {
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) return null;

    const day = date.getDay();
    const hour = date.getHours();
    const weekend = day === 5 || day === 6 || day === 0;

    if (weekend && hour >= 18) return "WEEKEND_NIGHT";
    if (weekend) return "WEEKEND_DAY";
    if (hour >= 18) return "WEEKDAY_NIGHT";
    if (hour >= 12) return "WEEKDAY_AFTERNOON";
    return "WEEKDAY_MORNING";
}

export function buildEventPreferenceSignals(event, weight = 1) {
    if (!event || !Number.isFinite(Number(weight)) || Number(weight) === 0) return [];

    const signedWeight = Number(weight);
    const signals = [];
    const add = (scope, target, multiplier = 1) => {
        if (!target || !PREFERENCE_SCOPES.has(scope)) return;
        signals.push({
            scope,
            target: String(target),
            weight: signedWeight * multiplier,
        });
    };

    add("CATEGORY", event.category, 1);
    add("CITY", event.city, 0.8);
    add("LOCATION", event.location, 0.55);
    add("PRICE_BAND", getPriceBand(event.price), 0.65);
    add("TIME_SLOT", getTimeSlot(event.startDate), 0.6);
    add("ORGANIZATION", event.organizationId, 0.7);
    add("VENUE", event.venueId, 0.75);

    return signals;
}

export function buildRecommendationProfile({
    user = null,
    views = [],
    favorites = [],
    bookings = [],
    alerts = [],
    preferences = [],
} = {}) {
    const baseProfile = buildDiscoveryProfile({ user, views, favorites, bookings, alerts });
    const categoryWeights = cloneMap(baseProfile.categoryWeights);
    const cityWeights = cloneMap(baseProfile.cityWeights);
    const locationWeights = cloneMap(baseProfile.locationWeights);
    const priceBandWeights = new Map();
    const timeSlotWeights = new Map();
    const organizationWeights = new Map();
    const venueWeights = new Map();

    for (const preference of preferences) {
        const weight = Number(preference.weight || 0);
        if (!Number.isFinite(weight) || weight === 0) continue;

        switch (preference.scope) {
            case "CATEGORY":
                addWeight(categoryWeights, preference.target, weight);
                break;
            case "CITY":
                addWeight(cityWeights, preference.target, weight);
                break;
            case "LOCATION":
                addWeight(locationWeights, preference.target, weight);
                break;
            case "PRICE_BAND":
                addWeight(priceBandWeights, preference.target, weight);
                break;
            case "TIME_SLOT":
                addWeight(timeSlotWeights, preference.target, weight);
                break;
            case "ORGANIZATION":
                addWeight(organizationWeights, preference.target, weight);
                break;
            case "VENUE":
                addWeight(venueWeights, preference.target, weight);
                break;
            default:
                break;
        }
    }

    const normalizedCategoryWeights = normalizeScoreMap(categoryWeights);
    const normalizedCityWeights = normalizeScoreMap(cityWeights);
    const normalizedLocationWeights = normalizeScoreMap(locationWeights);
    const normalizedPriceBandWeights = normalizeScoreMap(priceBandWeights);
    const normalizedTimeSlotWeights = normalizeScoreMap(timeSlotWeights);
    const normalizedOrganizationWeights = normalizeScoreMap(organizationWeights);
    const normalizedVenueWeights = normalizeScoreMap(venueWeights);
    const hasStoredPreferences =
        normalizedPriceBandWeights.size > 0 ||
        normalizedTimeSlotWeights.size > 0 ||
        normalizedOrganizationWeights.size > 0 ||
        normalizedVenueWeights.size > 0 ||
        preferences.length > 0;

    return {
        ...baseProfile,
        hasSignals: baseProfile.hasSignals || hasStoredPreferences,
        categoryWeights: normalizedCategoryWeights,
        cityWeights: normalizedCityWeights,
        locationWeights: normalizedLocationWeights,
        priceBandWeights: normalizedPriceBandWeights,
        timeSlotWeights: normalizedTimeSlotWeights,
        organizationWeights: normalizedOrganizationWeights,
        venueWeights: normalizedVenueWeights,
        profileSummary: getDiscoveryProfileSummary({
            ...baseProfile,
            hasSignals: baseProfile.hasSignals || hasStoredPreferences,
            categoryWeights: normalizedCategoryWeights,
            cityWeights: normalizedCityWeights,
            locationWeights: normalizedLocationWeights,
        }),
    };
}

function getStoredPreferenceBoost(event, profile) {
    return (
        getWeight(profile.priceBandWeights, getPriceBand(event.price)) * 8 +
        getWeight(profile.timeSlotWeights, getTimeSlot(event.startDate)) * 7 +
        getWeight(profile.organizationWeights, event.organizationId) * 10 +
        getWeight(profile.venueWeights, event.venueId) * 9
    );
}

function getNegativePreferencePenalty(event, profile) {
    return (
        getNegativeWeight(profile.categoryWeights, event.category) * 24 +
        getNegativeWeight(profile.cityWeights, event.city) * 14 +
        getNegativeWeight(profile.locationWeights, event.location) * 8 +
        getNegativeWeight(profile.priceBandWeights, getPriceBand(event.price)) * 7 +
        getNegativeWeight(profile.timeSlotWeights, getTimeSlot(event.startDate)) * 6 +
        getNegativeWeight(profile.organizationWeights, event.organizationId) * 10 +
        getNegativeWeight(profile.venueWeights, event.venueId) * 12
    );
}

export function rankRecommendedEvents(events, profile, now = new Date()) {
    return rankDiscoveryEvents(events, profile, now)
        .map((event) => {
            const storedPreferenceBoost = getStoredPreferenceBoost(event, profile);
            const negativePreferencePenalty = getNegativePreferencePenalty(event, profile);
            const recommendationScore = Math.round(
                Number(event.matchScore || 0) +
                storedPreferenceBoost +
                negativePreferencePenalty
            );

            return {
                ...event,
                recommendationScore,
                matchScore: recommendationScore,
                pulseScore: Math.max(18, Math.min(99, recommendationScore + 24)),
                negativePreferencePenalty: Math.round(negativePreferencePenalty),
            };
        })
        .sort((a, b) => {
            const scoreDelta = Number(b.recommendationScore || 0) - Number(a.recommendationScore || 0);
            if (scoreDelta !== 0) return scoreDelta;
            return new Date(a.startDate) - new Date(b.startDate);
        });
}

export async function upsertUserEventPreferences(tx, userId, event, interactionType, explicitWeight = null, now = new Date()) {
    if (!userId || !event) return [];

    const weight = getInteractionWeight(interactionType, explicitWeight);
    const signals = buildEventPreferenceSignals(event, weight);

    for (const signal of signals) {
        await tx.userEventPreference.upsert({
            where: {
                userId_scope_target: {
                    userId,
                    scope: signal.scope,
                    target: signal.target,
                },
            },
            create: {
                userId,
                scope: signal.scope,
                target: signal.target,
                weight: signal.weight,
                signalCount: 1,
                lastSignalAt: now,
            },
            update: {
                weight: { increment: signal.weight },
                signalCount: { increment: 1 },
                lastSignalAt: now,
            },
        });
    }

    return signals;
}

export async function recordEventInteraction(prismaClient, {
    userId = null,
    eventId,
    type,
    source = null,
    weight = null,
    metadata = null,
    now = new Date(),
} = {}) {
    const id = Number(eventId);
    if (Number.isNaN(id)) return null;

    return prismaClient.$transaction(async (tx) => {
        const event = await tx.event.findUnique({
            where: { id },
            select: {
                id: true,
                category: true,
                city: true,
                location: true,
                price: true,
                startDate: true,
                organizationId: true,
                venueId: true,
            },
        });

        if (!event) return null;

        const interaction = await tx.eventInteraction.create({
            data: {
                userId,
                eventId: id,
                type,
                weight: getInteractionWeight(type, weight),
                source,
                metadata,
                createdAt: now,
            },
        });

        await upsertUserEventPreferences(tx, userId, event, type, weight, now);

        return interaction;
    });
}
