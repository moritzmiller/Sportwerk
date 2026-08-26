import assert from "node:assert/strict";
import test from "node:test";

import { buildOrganizerAnalytics } from "../src/lib/organizer-analytics.js";

test("buildOrganizerAnalytics summarizes organizer revenue and engagement", () => {
    const events = [
        {
            id: 1,
            title: "Club Night",
            ownerId: "organizer-1",
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
            ownerId: "organizer-2",
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
            serviceFee: 2,
            createdAt: new Date("2026-01-05T12:00:00.000Z"),
            checkedInAt: new Date(),
        },
        {
            eventId: 1,
            status: "PAID",
            quantity: 1,
            totalAmount: 12,
            serviceFee: 1,
            createdAt: new Date("2026-03-10T12:00:00.000Z"),
            checkedInAt: null,
        },
        {
            eventId: 1,
            status: "AWAITING_PAYMENT",
            quantity: 1,
            totalAmount: 12,
            serviceFee: 1,
            createdAt: new Date("2026-03-11T12:00:00.000Z"),
            checkedInAt: null,
        },
        {
            eventId: 2,
            status: "REFUNDED",
            quantity: 1,
            totalAmount: 8,
            serviceFee: 0,
            createdAt: new Date("2026-03-12T12:00:00.000Z"),
            checkedInAt: null,
        },
    ];

    const analytics = buildOrganizerAnalytics({ events, bookings });

    assert.equal(analytics.totals.events, 2);
    assert.equal(analytics.totals.publishedEvents, 1);
    assert.equal(analytics.totals.revenue, 36);
    assert.equal(analytics.totals.serviceFees, 3);
    assert.equal(analytics.totals.netTicketRevenue, 33);
    assert.equal(analytics.totals.refundedAmount, 8);
    assert.equal(analytics.totals.netRevenue, 28);
    assert.equal(analytics.totals.ticketsSold, 3);
    assert.equal(analytics.totals.averageTicketPrice, 11);
    assert.equal(analytics.totals.averageGrossTicketValue, 12);
    assert.equal(analytics.totals.organizerCount, 2);
    assert.equal(analytics.totals.averageTicketsPerOrganizer, 1.5);
    assert.equal(analytics.totals.checkedInTickets, 2);
    assert.equal(analytics.totals.pendingBookings, 1);
    assert.equal(analytics.totals.conversionRate, 8);
    assert.equal(analytics.totals.favoriteRate, 20);
    assert.equal(analytics.totals.checkInRate, 67);

    assert.equal(analytics.topEvents[0].title, "Club Night");
    assert.equal(analytics.topEvents[0].fillRate, 30);
    assert.equal(analytics.topEvents[0].conversionRate, 10);
    assert.equal(analytics.topEvents[0].averageTicketPrice, 11);
    assert.deepEqual(analytics.revenueComposition, {
        ticketRevenue: 33,
        serviceFees: 3,
        refundedAmount: 8,
    });
    assert.deepEqual(analytics.paymentFunnel, {
        paid: 2,
        pending: 1,
        refunded: 1,
    });
    assert.equal(analytics.chartScales.eventTicketMax, 3);
    assert.equal(analytics.chartScales.monthlyTicketMax, 2);
    assert.deepEqual(
        analytics.monthlyTicketSales.map((month) => ({
            key: month.key,
            ticketsSold: month.ticketsSold,
        })),
        [
            { key: "2026-01", ticketsSold: 2 },
            { key: "2026-02", ticketsSold: 0 },
            { key: "2026-03", ticketsSold: 1 },
        ]
    );
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
