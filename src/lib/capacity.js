export function canReserveSeats(event, quantity, currentReserved = 0) {
    const capacity = Number(event?.capacity || 0);
    if (!capacity) return true;
    const reserved = Number(currentReserved || 0);
    const nextReserved = reserved + Number(quantity || 0);
    return nextReserved <= capacity;
}

export function getReservationDelta(previousQuantity, nextQuantity) {
    return Number(nextQuantity || 0) - Number(previousQuantity || 0);
}
