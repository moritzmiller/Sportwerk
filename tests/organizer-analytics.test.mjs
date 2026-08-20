import assert from "node:assert/strict";
import test from "node:test";

import { buildOrganizerAnalytics } from "../src/lib/organizer-analytics.js";

test("buildOrganizerAnalytics summarizes organizer revenue and engagement", () => {
    const events = [
        {
            id: 1,
            title: "Club Night",
            status: "PUBLISHED",
            startDate: new Date(Date.now() + 86_400_000),
            city: "Dresden",
            location: "Neustadt",
            capacity: 10,
            viewCount: 20,
            organization: { name: "GateKeeper" },
            venue: { name: "Main Room" },
            _count: {
                views: 12,
                favorites: 4,
                impressions: 30,
                interactions: 6,
            },
        },
        {
            id: 2,
            title: "Workshop",
            status: "DRAFT",
            startDate: new Date(Date.now() - 86_400_000),
            city: "Dresden",
            location: "Lab",
            capacity: null,
            viewCount: 5,
            _count: {
                views: 5,
                favorites: 1,
                impressions: 8,
                interactions: 2,
            },
        },
    ];

    const bookings = [
        {
            eventId: 1,
            status: "PAID",
            quantity: 2,
            totalAmount: 24,
            checkedInAt: new Date(),
        },
        {
            eventId: 1,
            status: "PAID",
            quantity: 1,
            totalAmount: 12,
            checkedInAt: null,
        },
        {
            eventId: 1,
            status: "AWAITING_PAYMENT",
            quantity: 1,
            totalAmount: 12,
            checkedInAt: null,
        },
        {
            eventId: 2,
            status: "REFUNDED",
            quantity: 1,
            totalAmount: 8,
            checkedInAt: null,
        },
    ];

    const analytics = buildOrganizerAnalytics({ events, bookings });

    assert.equal(analytics.totals.events, 2);
    assert.equal(analytics.totals.publishedEvents, 1);
    assert.equal(analytics.totals.revenue, 36);
    assert.equal(analytics.totals.refundedAmount, 8);
    assert.equal(analytics.totals.netRevenue, 28);
    assert.equal(analytics.totals.ticketsSold, 3);
    assert.equal(analytics.totals.checkedInTickets, 2);
    assert.equal(analytics.totals.pendingBookings, 1);
    assert.equal(analytics.totals.conversionRate, 8);
    assert.equal(analytics.totals.favoriteRate, 20);
    assert.equal(analytics.totals.checkInRate, 67);

    assert.equal(analytics.topEvents[0].title, "Club Night");
    assert.equal(analytics.topEvents[0].fillRate, 30);
    assert.equal(analytics.topEvents[0].conversionRate, 10);
});

test("buildOrganizerAnalytics flags published events that need attention", () => {
    const analytics = buildOrganizerAnalytics({
        events: [
            {
                id: 1,
                title: "Slow Seller",
                status: "PUBLISHED",
                startDate: new Date(),
                capacity: 100,
                viewCount: 40,
                _count: {
                    views: 40,
                    favorites: 0,
                    impressions: 0,
                    interactions: 0,
                },
            },
        ],
        bookings: [],
    });

    assert.equal(analytics.attentionNeeded.length, 1);
    assert.equal(analytics.attentionNeeded[0].title, "Slow Seller");
});
