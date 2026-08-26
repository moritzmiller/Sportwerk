function sumBy(items, selector) {
    return items.reduce((sum, item) => sum + Number(selector(item) || 0), 0);
}

function percent(part, total) {
    const normalizedTotal = Number(total) || 0;
    if (normalizedTotal <= 0) return 0;
    return Math.round((Number(part || 0) / normalizedTotal) * 100);
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function average(total, count) {
    const normalizedCount = Number(count) || 0;
    if (normalizedCount <= 0) return 0;
    return roundMoney(Number(total || 0) / normalizedCount);
}

function toValidDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date) {
    return date.toLocaleDateString("de-DE", {
        month: "short",
        year: "2-digit",
    });
}

function buildMonthlyTicketSales(bookings) {
    const paidBookings = bookings
        .filter((booking) => booking.status === "PAID")
        .map((booking) => ({
            ...booking,
            saleDate: toValidDate(booking.createdAt),
        }))
        .filter((booking) => booking.saleDate);

    if (paidBookings.length === 0) return [];

    const countsByMonth = new Map();
    for (const booking of paidBookings) {
        const key = getMonthKey(booking.saleDate);
        countsByMonth.set(key, (countsByMonth.get(key) || 0) + Number(booking.quantity || 0));
    }

    const sortedDates = paidBookings
        .map((booking) => booking.saleDate)
        .sort((a, b) => a.getTime() - b.getTime());
    const cursor = new Date(sortedDates[0].getFullYear(), sortedDates[0].getMonth(), 1);
    const end = new Date(
        sortedDates[sortedDates.length - 1].getFullYear(),
        sortedDates[sortedDates.length - 1].getMonth(),
        1
    );
    const months = [];

    while (cursor <= end) {
        const key = getMonthKey(cursor);
        months.push({
            key,
            label: getMonthLabel(cursor),
            ticketsSold: countsByMonth.get(key) || 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
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
        serviceFees: 0,
        netTicketRevenue: 0,
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
        averageTicketPrice: 0,
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
            summary.serviceFees += Number(booking.serviceFee || 0);
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
            revenue: roundMoney(summary.revenue),
            serviceFees: roundMoney(summary.serviceFees),
            netTicketRevenue: roundMoney(summary.revenue - summary.serviceFees),
            conversionRate: percent(summary.paidBookings, summary.views),
            favoriteRate: percent(summary.favorites, summary.views),
            checkInRate: percent(summary.checkedInTickets, summary.ticketsSold),
            fillRate: summary.capacity ? percent(summary.ticketsSold, summary.capacity) : 0,
            averageTicketPrice: average(summary.revenue - summary.serviceFees, summary.ticketsSold),
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
        serviceFees: sumBy(eventPerformance, (event) => event.serviceFees),
        netTicketRevenue: sumBy(eventPerformance, (event) => event.netTicketRevenue),
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
    const activeOrganizerIds = new Set(events.map((event) => event.ownerId).filter(Boolean));
    const organizerCount = activeOrganizerIds.size || (events.length > 0 ? 1 : 0);
    const revenueMax = Math.max(totals.netTicketRevenue, totals.serviceFees, totals.refundedAmount, 0);
    const funnelMax = Math.max(totals.paidBookings, totals.pendingBookings, totals.refundedBookings, 0);
    const eventTicketMax = Math.max(...eventPerformance.map((event) => event.ticketsSold), 0);
    const monthlyTicketSales = buildMonthlyTicketSales(bookings);
    const monthlyTicketMax = Math.max(
        ...monthlyTicketSales.map((month) => month.ticketsSold),
        0
    );

    return {
        totals: {
            ...totals,
            revenue: roundMoney(totals.revenue),
            serviceFees: roundMoney(totals.serviceFees),
            netTicketRevenue: roundMoney(totals.netTicketRevenue),
            refundedAmount: roundMoney(totals.refundedAmount),
            netRevenue: roundMoney(totals.revenue - totals.refundedAmount),
            averageTicketPrice: average(totals.netTicketRevenue, totals.ticketsSold),
            averageGrossTicketValue: average(totals.revenue, totals.ticketsSold),
            organizerCount,
            averageTicketsPerOrganizer: average(totals.ticketsSold, Math.max(organizerCount, 1)),
            conversionRate: percent(totals.paidBookings, totals.views),
            favoriteRate: percent(totals.favorites, totals.views),
            checkInRate: percent(totals.checkedInTickets, totals.ticketsSold),
        },
        chartScales: {
            revenueMax,
            funnelMax,
            eventTicketMax,
            monthlyTicketMax,
        },
        revenueComposition: {
            ticketRevenue: roundMoney(totals.netTicketRevenue),
            serviceFees: roundMoney(totals.serviceFees),
            refundedAmount: roundMoney(totals.refundedAmount),
        },
        paymentFunnel: {
            paid: totals.paidBookings,
            pending: totals.pendingBookings,
            refunded: totals.refundedBookings,
        },
        monthlyTicketSales,
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
