import assert from "node:assert/strict";
import test from "node:test";
import {
    disableUserAccount,
    reactivateUserAccount,
} from "../src/lib/user-deactivation.js";

function createTx(user = {}) {
    const state = {
        user: {
            id: "user-1",
            email: "user@example.com",
            disabledAt: null,
            disabledById: null,
            disabledReason: null,
            ...user,
        },
    };
    const calls = [];

    return {
        calls,
        state,
        event: {
            updateMany: async (args) => {
                calls.push(["event.updateMany", args]);
                return { count: 2 };
            },
        },
        eventAuditLog: {
            create: async (args) => {
                calls.push(["eventAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
        user: {
            update: async ({ where, data }) => {
                calls.push(["user.update", { where, data }]);
                state.user = { ...state.user, ...data };
                return { ...state.user };
            },
        },
    };
}

test("disableUserAccount cancels active owned events and marks user disabled", async () => {
    const tx = createTx();
    const disabledAt = new Date("2026-07-13T10:00:00.000Z");

    const user = await disableUserAccount(tx, {
        userId: "user-1",
        adminId: "admin-1",
        disabledAt,
        eventCancellationReason: "Account deaktiviert",
        auditDetails: { userEmail: "user@example.com" },
    });

    assert.equal(user.disabledAt, disabledAt);
    assert.equal(user.disabledById, "admin-1");
    assert.equal(user.disabledReason, "Admin-Deaktivierung");

    const eventUpdate = tx.calls.find(([name]) => name === "event.updateMany")[1];
    assert.deepEqual(eventUpdate.where, {
        ownerId: "user-1",
        status: { in: ["DRAFT", "PUBLISHED", "POSTPONED", "SOLD_OUT"] },
    });
    assert.equal(eventUpdate.data.status, "CANCELLED");
    assert.equal(eventUpdate.data.cancelledAt, disabledAt);

    const audit = tx.calls.find(([name]) => name === "eventAuditLog.create")[1];
    assert.equal(audit.data.actorId, "admin-1");
    assert.equal(audit.data.action, "admin.user.disabled");
    assert.equal(audit.data.details.userEmail, "user@example.com");
});

test("reactivateUserAccount clears disabled fields and writes audit log", async () => {
    const tx = createTx({
        disabledAt: new Date("2026-07-13T10:00:00.000Z"),
        disabledById: "admin-1",
        disabledReason: "Admin-Deaktivierung",
    });

    const user = await reactivateUserAccount(tx, {
        userId: "user-1",
        adminId: "admin-2",
        auditAction: "admin.organizer.reactivated",
        auditDetails: { organizerEmail: "user@example.com" },
    });

    assert.equal(user.disabledAt, null);
    assert.equal(user.disabledById, null);
    assert.equal(user.disabledReason, null);
    assert.equal(tx.calls.some(([name]) => name === "event.updateMany"), false);

    const audit = tx.calls.find(([name]) => name === "eventAuditLog.create")[1];
    assert.equal(audit.data.actorId, "admin-2");
    assert.equal(audit.data.action, "admin.organizer.reactivated");
    assert.equal(audit.data.details.organizerEmail, "user@example.com");
});
