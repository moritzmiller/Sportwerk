function sumBy(items, selector) {
    return items.reduce((sum, item) => sum + Number(selector(item) || 0), 0);
}

function percent(part, total) {
    const normalizedTotal = Number(total) || 0;
    if (normalizedTotal <= 0) return 0;
    return Math.round((Number(part || 0) / normalizedTotal) * 100);
}

function getEventCounts(event) {
    return {
        views: Number(event.viewCount ?? event._count?.views ?? 0),
        favorites: Number(event._count?.favorites ?? 0),
        impressions: Number(event._count?.impressions ?? 0),
        interactions: Number(event._count?.interactions ?? 0),
    };
}

function emptyEventSummary(event) {
    const counts = getEventCounts(event);

    return {
        id: event.id,
        title: event.title,
        status: event.status,
        startDate: event.startDate,
        capacity: event.capacity ?? null,
        city: event.city ?? null,
        location: event.location ?? null,
        organizationName: event.organization?.name ?? null,
        venueName: event.venue?.name ?? null,
        revenue: 0,
        refundedAmount: 0,
        paidBookings: 0,
        pendingBookings: 0,
        refundedBookings: 0,
        ticketsSold: 0,
        checkedInTickets: 0,
        views: counts.views,
        favorites: counts.favorites,
        impressions: counts.impressions,
        interactions: counts.interactions,
        conversionRate: 0,
        favoriteRate: 0,
        checkInRate: 0,
        fillRate: 0,
    };
}

export function buildOrganizerAnalytics({ events = [], bookings = [] } = {}) {
    const eventSummaries = new Map(
        events.map((event) => [event.id, emptyEventSummary(event)])
    );

    for (const booking of bookings) {
        const summary = eventSummaries.get(booking.eventId);
        if (!summary) continue;

        if (booking.status === "PAID") {
            summary.revenue += Number(booking.totalAmount || 0);
            summary.paidBookings += 1;
            summary.ticketsSold += Number(booking.quantity || 0);

            if (booking.checkedInAt) {
                summary.checkedInTickets += Number(booking.quantity || 0);
            }
        }

        if (booking.status === "AWAITING_PAYMENT") {
            summary.pendingBookings += 1;
        }

        if (booking.status === "REFUNDED") {
            summary.refundedAmount += Number(booking.totalAmount || 0);
            summary.refundedBookings += 1;
        }
    }

    const eventPerformance = [...eventSummaries.values()]
        .map((summary) => ({
            ...summary,
            conversionRate: percent(summary.paidBookings, summary.views),
            favoriteRate: percent(summary.favorites, summary.views),
            checkInRate: percent(summary.checkedInTickets, summary.ticketsSold),
            fillRate: summary.capacity ? percent(summary.ticketsSold, summary.capacity) : 0,
        }))
        .sort((a, b) => {
            if (b.revenue !== a.revenue) return b.revenue - a.revenue;
            if (b.ticketsSold !== a.ticketsSold) return b.ticketsSold - a.ticketsSold;
            return b.views - a.views;
        });

    const totals = {
        events: eventPerformance.length,
        publishedEvents: eventPerformance.filter((event) => event.status === "PUBLISHED")
            .length,
        upcomingEvents: eventPerformance.filter(
            (event) => event.startDate && new Date(event.startDate) >= new Date()
        ).length,
        revenue: sumBy(eventPerformance, (event) => event.revenue),
        refundedAmount: sumBy(eventPerformance, (event) => event.refundedAmount),
        paidBookings: sumBy(eventPerformance, (event) => event.paidBookings),
        pendingBookings: sumBy(eventPerformance, (event) => event.pendingBookings),
        refundedBookings: sumBy(eventPerformance, (event) => event.refundedBookings),
        ticketsSold: sumBy(eventPerformance, (event) => event.ticketsSold),
        checkedInTickets: sumBy(eventPerformance, (event) => event.checkedInTickets),
        views: sumBy(eventPerformance, (event) => event.views),
        favorites: sumBy(eventPerformance, (event) => event.favorites),
        impressions: sumBy(eventPerformance, (event) => event.impressions),
        interactions: sumBy(eventPerformance, (event) => event.interactions),
    };

    return {
        totals: {
            ...totals,
            netRevenue: totals.revenue - totals.refundedAmount,
            conversionRate: percent(totals.paidBookings, totals.views),
            favoriteRate: percent(totals.favorites, totals.views),
            checkInRate: percent(totals.checkedInTickets, totals.ticketsSold),
        },
        eventPerformance,
        topEvents: eventPerformance.slice(0, 5),
        attentionNeeded: eventPerformance
            .filter(
                (event) =>
                    event.status === "PUBLISHED" &&
                    (event.pendingBookings > 0 ||
                        event.fillRate < 20 ||
                        (event.views >= 10 && event.conversionRate === 0))
            )
            .slice(0, 5),
    };
}
