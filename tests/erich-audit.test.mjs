import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildErichAuditEntry,
    requireErichAuditReason,
    sanitizeErichAuditValue,
    writeErichAuditLog,
} from "../src/lib/erich/audit.js";

test("ERICH audit sanitizes technical secrets and file ids", () => {
    const value = sanitizeErichAuditValue({
        firstName: "Ada",
        parasport: true,
        token: "secret-token",
        ticketId: "ticket-secret",
        portraitFileAssetId: "file-asset-1",
        providerPayload: {
            clientSecret: "payment-secret",
            status: "paid",
        },
    });

    assert.equal(value.firstName, "Ada");
    assert.equal(value.parasport, "[redacted]");
    assert.equal(value.token, "[redacted]");
    assert.equal(value.ticketId, "[redacted]");
    assert.equal(value.portraitFileAssetId, "[redacted]");
    assert.equal(value.providerPayload.clientSecret, "[redacted]");
    assert.equal(value.providerPayload.status, "paid");
});

test("ERICH audit requires reasons for critical actions", () => {
    assert.throws(
        () => requireErichAuditReason({ action: "price.phase.updated", reason: "" }),
        (error) => {
            assert.equal(error.code, "ERICH_AUDIT_REASON_REQUIRED");
            return true;
        }
    );

    assert.equal(
        requireErichAuditReason({
            action: "price.phase.updated",
            reason: "Freigegebene Preisphase korrigiert",
        }),
        "Freigegebene Preisphase korrigiert"
    );
});

test("ERICH audit builds append-only Prisma create data", () => {
    const entry = buildErichAuditEntry({
        eventId: "event-1",
        actorId: "admin-1",
        entityType: "ErichRaceDefinition",
        entityId: "race-1",
        action: "race.rule.updated",
        reason: "Fachlich bestaetigte Hochmeldung hinterlegt",
        oldValue: { higherAgeClassAllowed: false },
        newValue: { higherAgeClassAllowed: true, higherAgeMinimumBirthYear: 2010 },
        metadata: { ticketId: "must-not-log" },
    });

    assert.deepEqual(entry, {
        eventId: "event-1",
        actorId: "admin-1",
        entityType: "ErichRaceDefinition",
        entityId: "race-1",
        action: "race.rule.updated",
        reason: "Fachlich bestaetigte Hochmeldung hinterlegt",
        oldValue: { higherAgeClassAllowed: false },
        newValue: { higherAgeClassAllowed: true, higherAgeMinimumBirthYear: 2010 },
        metadata: { ticketId: "[redacted]" },
    });
});

test("ERICH audit writes through an injected store", async () => {
    const calls = [];
    const store = {
        erichAuditLog: {
            create: async (args) => {
                calls.push(args);
                return { id: "audit-1", ...args.data };
            },
        },
    };

    const result = await writeErichAuditLog({
        store,
        eventId: "event-1",
        actorId: "admin-1",
        entityType: "ErichPayment",
        entityId: "payment-1",
        action: "payment.status.updated",
        reason: "Serverseitig bestaetigter PSP-Webhook",
        oldValue: { status: "PENDING" },
        newValue: { status: "SUCCESSFUL", providerPayload: { clientSecret: "secret" } },
    });

    assert.equal(result.id, "audit-1");
    assert.equal(calls[0].data.newValue.providerPayload.clientSecret, "[redacted]");
    assert.equal(calls[0].data.reason, "Serverseitig bestaetigter PSP-Webhook");
});
