import assert from "node:assert/strict";
import test from "node:test";

import { getAttendanceSnapshot, summarizeAttendance } from "../src/lib/attendance.js";

test("getAttendanceSnapshot tolerates null attendance and null fallback", () => {
    const snapshot = getAttendanceSnapshot(null, null);

    assert.deepEqual(snapshot, {
        paidBookings: 0,
        paidTickets: 0,
        checkedInBookings: 0,
        checkedInTickets: 0,
        remainingTickets: 0,
        attendanceRate: 0,
    });
});

test("getAttendanceSnapshot can fall back to event soldTickets", () => {
    const snapshot = getAttendanceSnapshot(null, { soldTickets: 12 });

    assert.equal(snapshot.paidTickets, 12);
    assert.equal(snapshot.checkedInTickets, 0);
    assert.equal(snapshot.remainingTickets, 12);
});

test("summarizeAttendance counts paid and checked-in ticket quantities", () => {
    const summary = summarizeAttendance([
        { eventId: 1, status: "PAID", quantity: 2, checkedInAt: new Date() },
        { eventId: 1, status: "PAID", quantity: 3, checkedInAt: null },
        { eventId: 1, status: "AWAITING_PAYMENT", quantity: 5, checkedInAt: null },
    ]);

    assert.deepEqual(summary.get(1), {
        eventId: 1,
        paidBookings: 2,
        paidTickets: 5,
        checkedInBookings: 1,
        checkedInTickets: 2,
    });
});
