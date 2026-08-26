import assert from "node:assert/strict";
import test from "node:test";

import {
    getCrmCustomerBookingWhere,
    hasCrmCustomerAccess,
} from "../src/lib/crm.js";

const organizer = {
    id: "organizer-1",
    role: "ORGANIZER",
};

test("CRM customer access requires an accessible booking for the email address", async () => {
    const calls = [];
    const prisma = {
        booking: {
            findFirst: async (query) => {
                calls.push(query);
                return { id: "booking-1" };
            },
        },
    };

    const allowed = await hasCrmCustomerAccess(prisma, organizer, "  ADA@Example.Test ");

    assert.equal(allowed, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].select, { id: true });
    assert.deepEqual(calls[0].where.purchaserEmail, {
        equals: "ada@example.test",
        mode: "insensitive",
    });
    assert.deepEqual(calls[0].where.event.OR[0], { ownerId: "organizer-1" });
});

test("CRM customer access rejects arbitrary emails without accessible bookings", async () => {
    const prisma = {
        booking: {
            findFirst: async () => null,
        },
    };

    const allowed = await hasCrmCustomerAccess(prisma, organizer, "unknown@example.test");

    assert.equal(allowed, false);
});

test("CRM customer access rejects visitors and missing email before querying", async () => {
    let queried = false;
    const prisma = {
        booking: {
            findFirst: async () => {
                queried = true;
                return { id: "booking-1" };
            },
        },
    };

    assert.equal(
        await hasCrmCustomerAccess(prisma, { id: "visitor-1", role: "VISITOR" }, "ada@example.test"),
        false
    );
    assert.equal(await hasCrmCustomerAccess(prisma, organizer, ""), false);
    assert.equal(queried, false);
});

test("CRM customer booking where scopes admins globally and organizers by event access", () => {
    assert.deepEqual(getCrmCustomerBookingWhere({ id: "admin-1", role: "ADMIN" }, "ADA@example.test"), {
        purchaserEmail: {
            equals: "ada@example.test",
            mode: "insensitive",
        },
    });

    const where = getCrmCustomerBookingWhere(organizer, "ada@example.test");

    assert.equal(where.event.OR.length, 4);
    assert.deepEqual(where.purchaserEmail, {
        equals: "ada@example.test",
        mode: "insensitive",
    });
});
