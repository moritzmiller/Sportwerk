export async function markBookingAndTicketsCheckedIn(tx, booking, { now = new Date(), userId = null, via = "scanner" } = {}) {
    if (!tx?.booking || !booking?.id) {
        throw new Error("booking is required.");
    }

    const bookingUpdate = await tx.booking.updateMany({
        where: {
            id: booking.id,
            checkedInAt: null,
        },
        data: {
            checkedInAt: now,
            checkedInById: userId,
            checkedInVia: via,
        },
    });

    if (bookingUpdate.count !== 1 || !tx.ticket) {
        return {
            action: bookingUpdate.count === 1 ? "booking-only" : "ignored",
            count: bookingUpdate.count,
            ticketsUpdated: 0,
        };
    }

    const ticketUpdate = await tx.ticket.updateMany({
        where: {
            bookingId: booking.id,
            status: "VALID",
            checkedInAt: null,
        },
        data: {
            status: "CHECKED_IN",
            checkedInAt: now,
            checkedInById: userId,
            checkedInVia: via,
        },
    });

    return {
        action: "checked-in",
        count: bookingUpdate.count,
        ticketsUpdated: ticketUpdate.count,
    };
}
