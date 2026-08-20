function normalizeQuantity(value) {
    const quantity = Number(value || 0);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function createAttendanceEntry(eventId) {
    return {
        eventId,
        paidBookings: 0,
        paidTickets: 0,
        checkedInBookings: 0,
        checkedInTickets: 0,
    };
}

export function summarizeAttendance(bookings = []) {
    const summary = new Map();

    for (const booking of bookings) {
        const eventId = Number(booking.eventId);

        if (!Number.isFinite(eventId)) {
            continue;
        }

        const quantity = normalizeQuantity(booking.quantity) || 1;
        const entry = summary.get(eventId) ?? createAttendanceEntry(eventId);

        if (booking.status === "PAID") {
            entry.paidBookings += 1;
            entry.paidTickets += quantity;

            if (booking.checkedInAt) {
                entry.checkedInBookings += 1;
                entry.checkedInTickets += quantity;
            }
        }

        summary.set(eventId, entry);
    }

    return summary;
}

export function getAttendanceSnapshot(attendance = null, fallback = {}) {
    const fallbackData = fallback ?? {};
    const paidTickets = Number(
        attendance?.paidTickets ?? fallbackData.paidTickets ?? fallbackData.soldTickets ?? 0
    );
    const checkedInTickets = Number(
        attendance?.checkedInTickets ?? fallbackData.checkedInTickets ?? 0
    );
    const paidBookings = Number(attendance?.paidBookings ?? fallbackData.paidBookings ?? 0);
    const checkedInBookings = Number(
        attendance?.checkedInBookings ?? fallbackData.checkedInBookings ?? 0
    );
    const attendanceRate = paidTickets > 0 ? checkedInTickets / paidTickets : 0;

    return {
        paidBookings,
        paidTickets,
        checkedInBookings,
        checkedInTickets,
        remainingTickets: Math.max(0, paidTickets - checkedInTickets),
        attendanceRate,
    };
}

export function formatAttendanceSummary(attendance = null, fallback = {}) {
    const snapshot = getAttendanceSnapshot(attendance, fallback);
    if (snapshot.paidTickets === 0) {
        return "Noch keine bezahlten Tickets";
    }

    return `${snapshot.checkedInTickets} / ${snapshot.paidTickets} Tickets anwesend`;
}
