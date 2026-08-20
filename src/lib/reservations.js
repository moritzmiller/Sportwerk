export class ReservationCapacityError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "ReservationCapacityError";
        this.code = "CAPACITY_EXCEEDED";
        this.details = details;
    }
}

export function isReservationCapacityError(error) {
    return error?.code === "CAPACITY_EXCEEDED";
}

function normalizeQuantity(value) {
    return Math.max(0, Number(value || 0));
}

async function incrementEventReservation(tx, eventId, quantity) {
    const amount = normalizeQuantity(quantity);
    if (amount === 0) return;

    const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { id: true, capacity: true },
    });

    if (!event) {
        throw new ReservationCapacityError("Event not found.", { eventId });
    }

    const where = {
        id: event.id,
        ...(event.capacity
            ? {
                  capacity: event.capacity,
                  soldTickets: { lte: Number(event.capacity) - amount },
              }
            : {}),
    };

    const result = await tx.event.updateMany({
        where,
        data: {
            soldTickets: { increment: amount },
        },
    });

    if (result.count !== 1) {
        throw new ReservationCapacityError("Event capacity exceeded.", {
            eventId,
            quantity: amount,
        });
    }
}

async function decrementEventReservation(tx, eventId, quantity) {
    const amount = normalizeQuantity(quantity);
    if (amount === 0) return;

    await tx.event.updateMany({
        where: {
            id: eventId,
            soldTickets: { gte: amount },
        },
        data: {
            soldTickets: { decrement: amount },
        },
    });
}

async function incrementTicketTypeReservation(tx, ticketTypeId, quantity) {
    const amount = normalizeQuantity(quantity);
    if (!ticketTypeId || amount === 0) return;

    const ticketType = await tx.eventTicketType.findUnique({
        where: { id: ticketTypeId },
        select: { id: true, quota: true },
    });

    if (!ticketType) {
        throw new ReservationCapacityError("Ticket type not found.", {
            ticketTypeId,
        });
    }

    const where = {
        id: ticketType.id,
        ...(ticketType.quota !== null
            ? {
                  quota: ticketType.quota,
                  soldCount: { lte: Number(ticketType.quota) - amount },
              }
            : {}),
    };

    const result = await tx.eventTicketType.updateMany({
        where,
        data: {
            soldCount: { increment: amount },
        },
    });

    if (result.count !== 1) {
        throw new ReservationCapacityError("Ticket type quota exceeded.", {
            ticketTypeId,
            quantity: amount,
        });
    }
}

async function decrementTicketTypeReservation(tx, ticketTypeId, quantity) {
    const amount = normalizeQuantity(quantity);
    if (!ticketTypeId || amount === 0) return;

    await tx.eventTicketType.updateMany({
        where: {
            id: ticketTypeId,
            soldCount: { gte: amount },
        },
        data: {
            soldCount: { decrement: amount },
        },
    });
}

export async function applyReservationChange(
    tx,
    {
        eventId,
        previousQuantity = 0,
        nextQuantity = 0,
        previousTicketTypeId = null,
        nextTicketTypeId = null,
    }
) {
    const previous = normalizeQuantity(previousQuantity);
    const next = normalizeQuantity(nextQuantity);
    const delta = next - previous;

    if (delta > 0) {
        await incrementEventReservation(tx, eventId, delta);
    } else if (delta < 0) {
        await decrementEventReservation(tx, eventId, Math.abs(delta));
    }

    if (previousTicketTypeId && previousTicketTypeId === nextTicketTypeId) {
        if (delta > 0) {
            await incrementTicketTypeReservation(tx, previousTicketTypeId, delta);
        } else if (delta < 0) {
            await decrementTicketTypeReservation(tx, previousTicketTypeId, Math.abs(delta));
        }
        return;
    }

    await decrementTicketTypeReservation(tx, previousTicketTypeId, previous);
    await incrementTicketTypeReservation(tx, nextTicketTypeId, next);
}

export async function releaseBookingReservation(tx, booking) {
    await applyReservationChange(tx, {
        eventId: booking.eventId,
        previousQuantity: booking.quantity,
        nextQuantity: 0,
        previousTicketTypeId: booking.ticketTypeId || null,
        nextTicketTypeId: null,
    });
}
