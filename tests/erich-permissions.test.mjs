import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertErichPermission,
    buildScannerAthleteSelect,
    canErich,
    canManageOwnErichRecord,
    ERICH_PERMISSIONS,
    getErichRegistrationAccessWhere,
    getErichRoleSet,
} from "../src/lib/erich/permissions.js";

test("ERICH users can only access own drafts and own data by default", () => {
    const user = { id: "user-1", role: "VISITOR", erichRoleAssignments: [] };

    assert.deepEqual([...getErichRoleSet(user)], ["USER"]);
    assert.equal(canErich(user, ERICH_PERMISSIONS.VIEW_OWN_DATA, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_PRICE_PHASES, "event-1"), false);
    assert.equal(canManageOwnErichRecord(user, { accountId: "user-1", eventId: "event-1" }), true);
    assert.equal(canManageOwnErichRecord(user, { accountId: "user-2", eventId: "event-1" }), false);
    assert.deepEqual(getErichRegistrationAccessWhere(user, "event-1"), {
        accountId: "user-1",
        eventId: "event-1",
    });
});

test("ERICH registration office can process registrations but not roles, payment config or audit logs", () => {
    const user = {
        id: "office-1",
        role: "VISITOR",
        erichRoleAssignments: [{ eventId: "event-1", role: "REGISTRATION_OFFICE" }],
    };

    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_LICENSE_REVIEWS, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_ROLES, "event-1"), false);
    assert.equal(canErich(user, ERICH_PERMISSIONS.CONFIGURE_PAYMENTS, "event-1"), false);
    assert.equal(canErich(user, ERICH_PERMISSIONS.VIEW_AUDIT_LOG, "event-1"), false);
    assert.deepEqual(getErichRegistrationAccessWhere(user, "event-1"), { eventId: "event-1" });
});

test("ERICH scanner can only scan, view reduced scanner data and issue documents", () => {
    const user = {
        id: "scanner-1",
        role: "VISITOR",
        erichRoleAssignments: [{ eventId: "event-1", role: "SCANNER" }],
    };

    assert.equal(canErich(user, ERICH_PERMISSIONS.SCAN_TICKETS, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.VIEW_SCANNER_DATA, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.ISSUE_DOCUMENTS, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.VIEW_REGISTRATIONS, "event-1"), false);
    assert.equal(canErich(user, ERICH_PERMISSIONS.EXPORT_DATA, "event-1"), false);
});

test("ERICH global GateKeeper admins receive ERICH admin permissions", () => {
    const user = { id: "admin-1", role: "ADMIN", erichRoleAssignments: [] };

    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_ROLES, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.ACTIVATE_EMERGENCY_MODE, "event-1"), true);
    assert.deepEqual(getErichRegistrationAccessWhere(user, "event-1"), { eventId: "event-1" });
});

test("ERICH permissions are event scoped", () => {
    const user = {
        id: "office-1",
        role: "VISITOR",
        erichRoleAssignments: [{ eventId: "event-1", role: "REGISTRATION_OFFICE" }],
    };

    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, "event-1"), true);
    assert.equal(canErich(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, "event-2"), false);
});

test("ERICH permission assertion throws a structured denial", () => {
    assert.throws(
        () =>
            assertErichPermission(
                { id: "user-1", role: "VISITOR", erichRoleAssignments: [] },
                ERICH_PERMISSIONS.VIEW_AUDIT_LOG,
                "event-1"
            ),
        (error) => {
            assert.equal(error.code, "ERICH_PERMISSION_DENIED");
            assert.equal(error.permission, ERICH_PERMISSIONS.VIEW_AUDIT_LOG);
            return true;
        }
    );
});

test("ERICH scanner athlete select excludes invoices, payment details, email and protected flags", () => {
    const select = buildScannerAthleteSelect();
    const serialized = JSON.stringify(select);

    assert.equal(select.firstName, true);
    assert.equal(select.lastName, true);
    assert.equal(serialized.includes("invoice"), false);
    assert.equal(serialized.includes("payment"), false);
    assert.equal(serialized.includes("email"), false);
    assert.equal(serialized.includes("germanLicenseNumber"), false);
    assert.equal(serialized.includes("parasport"), false);
});
