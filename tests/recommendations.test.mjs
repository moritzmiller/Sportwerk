import assert from "node:assert/strict";
import test from "node:test";

import {
    buildEventPreferenceSignals,
    buildRecommendationProfile,
    getInteractionWeight,
    getPriceBand,
    getTimeSlot,
    rankRecommendedEvents,
} from "../src/lib/recommendations.js";

test("interaction weights express intent strength", () => {
    assert.equal(getInteractionWeight("VIEW"), 1);
    assert.equal(getInteractionWeight("FAVORITE"), 7);
    assert.equal(getInteractionWeight("BOOKING"), 10);
    assert.equal(getInteractionWeight("HIDE"), -8);
    assert.equal(getInteractionWeight("VIEW", 2.5), 2.5);
});

test("price and time features are stable feed buckets", () => {
    assert.equal(getPriceBand(0), "FREE");
    assert.equal(getPriceBand(8), "LOW");
    assert.equal(getPriceBand(18), "MID");
    assert.equal(getPriceBand(45), "PREMIUM");
    assert.equal(getTimeSlot("2026-07-24T20:00:00.000Z"), "WEEKEND_NIGHT");
    assert.equal(getTimeSlot("2026-07-21T09:00:00.000Z"), "WEEKDAY_MORNING");
});

test("event preference signals cover taste, place, price, time, organizer, and venue", () => {
    const signals = buildEventPreferenceSignals(
        {
            category: "KONZERT",
            city: "Dresden",
            location: "Groove Station",
            price: 12,
            startDate: "2026-07-24T20:00:00.000Z",
            organizationId: "org_1",
            venueId: "venue_1",
        },
        4
    );

    assert.deepEqual(
        signals.map((signal) => [signal.scope, signal.target]),
        [
            ["CATEGORY", "KONZERT"],
            ["CITY", "Dresden"],
            ["LOCATION", "Groove Station"],
            ["PRICE_BAND", "MID"],
            ["TIME_SLOT", "WEEKEND_NIGHT"],
            ["ORGANIZATION", "org_1"],
            ["VENUE", "venue_1"],
        ]
    );
    assert.equal(signals.find((signal) => signal.scope === "CATEGORY").weight, 4);
});

test("stored preferences can lift a matching event above a generic popular event", () => {
    const profile = buildRecommendationProfile({
        user: { id: "user_1" },
        preferences: [
            { scope: "CATEGORY", target: "KONZERT", weight: 12 },
            { scope: "VENUE", target: "venue_fav", weight: 9 },
            { scope: "TIME_SLOT", target: "WEEKEND_NIGHT", weight: 6 },
        ],
    });
    const now = new Date("2026-07-20T10:00:00.000Z");
    const ranked = rankRecommendedEvents(
        [
            {
                id: 1,
                title: "Generic hit",
                category: "SPORT",
                city: "Dresden",
                location: "Arena",
                price: 12,
                startDate: "2026-07-25T14:00:00.000Z",
                viewCount: 500,
                soldTickets: 0,
                venueId: "venue_other",
            },
            {
                id: 2,
                title: "Favorite venue night",
                category: "KONZERT",
                city: "Dresden",
                location: "Club",
                price: 18,
                startDate: "2026-07-24T20:00:00.000Z",
                viewCount: 5,
                soldTickets: 0,
                venueId: "venue_fav",
            },
        ],
        profile,
        now
    );

    assert.equal(ranked[0].id, 2);
    assert.ok(ranked[0].recommendationScore > ranked[1].recommendationScore);
});

test("negative hide preferences push similar events down", () => {
    const profile = buildRecommendationProfile({
        user: { id: "user_1" },
        preferences: [
            { scope: "CATEGORY", target: "PARTY", weight: -8 },
            { scope: "LOCATION", target: "Club Basement", weight: -4.4 },
            { scope: "PRICE_BAND", target: "MID", weight: -5.2 },
            { scope: "TIME_SLOT", target: "WEEKEND_NIGHT", weight: -4.8 },
            { scope: "VENUE", target: "venue_hidden", weight: -6 },
        ],
    });
    const now = new Date("2026-07-20T10:00:00.000Z");
    const ranked = rankRecommendedEvents(
        [
            {
                id: 1,
                title: "Looks like hidden event",
                category: "PARTY",
                city: "Dresden",
                location: "Club Basement",
                price: 18,
                startDate: "2026-07-24T20:00:00.000Z",
                viewCount: 80,
                soldTickets: 0,
                venueId: "venue_hidden",
            },
            {
                id: 2,
                title: "Different suggestion",
                category: "WORKSHOP",
                city: "Dresden",
                location: "Studio",
                price: 0,
                startDate: "2026-07-25T14:00:00.000Z",
                viewCount: 10,
                soldTickets: 0,
                venueId: "venue_other",
            },
        ],
        profile,
        now
    );

    assert.equal(ranked[0].id, 2);
    assert.equal(ranked[1].id, 1);
    assert.ok(ranked[1].negativePreferencePenalty < 0);
});
