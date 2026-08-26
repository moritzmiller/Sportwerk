function toIsoString(value) {
    return value instanceof Date ? value.toISOString() : value ?? null;
}

export function serializeScannerTicket(booking) {
    return {
        id: booking.id,
        purchaserName: booking.purchaserName,
        quantity: booking.quantity,
        scanned: Boolean(booking.checkedInAt),
        checkedInAt: toIsoString(booking.checkedInAt),
    };
}

export function serializeScannerTicketRecord(ticket) {
    return {
        id: ticket.id,
        bookingId: ticket.bookingId,
        purchaserName: ticket.holderName ?? ticket.booking?.purchaserName ?? "Ticket",
        quantity: 1,
        scanned: Boolean(ticket.checkedInAt || ticket.status === "CHECKED_IN"),
        checkedInAt: toIsoString(ticket.checkedInAt),
    };
}

export function serializeScannerBooking(booking, { quantity = booking.quantity } = {}) {
    return {
        id: booking.id,
        eventId: booking.eventId,
        ticketId: booking.ticketId ?? undefined,
        purchaserName: booking.purchaserName,
        quantity,
        checkedInAt: toIsoString(booking.checkedInAt),
        checkedInVia: booking.checkedInVia ?? null,
    };
}
