import assert from "node:assert/strict";
import test from "node:test";
import {
    logSystemEvent,
    resolveSystemEvent,
    sanitizeSystemEventDetails,
} from "../src/lib/system-events.js";

test("sanitizeSystemEventDetails redacts sensitive keys", () => {
    const details = sanitizeSystemEventDetails({
        email: "user@example.com",
        password: "secret-password",
        nested: {
            apiKey: "secret-key",
            token: "secret-token",
            message: "safe",
        },
    });

    assert.equal(details.email, "user@example.com");
    assert.equal(details.password, "[redacted]");
    assert.equal(details.nested.apiKey, "[redacted]");
    assert.equal(details.nested.token, "[redacted]");
    assert.equal(details.nested.message, "safe");
});

test("sanitizeSystemEventDetails normalizes Error objects", () => {
    const error = new Error("SMTP failed");
    error.code = "SMTP_ERROR";
    error.status = 503;

    assert.deepEqual(sanitizeSystemEventDetails(error), {
        name: "Error",
        message: "SMTP failed",
        code: "SMTP_ERROR",
        status: 503,
    });
});

test("logSystemEvent writes sanitized event through injected store", async () => {
    const writes = [];
    const store = {
        systemEvent: {
            create: async (args) => {
                writes.push(args);
                return { id: "event-1", ...args.data };
            },
        },
    };

    const result = await logSystemEvent({
        level: "warning",
        area: "mail",
        message: "Mail failed",
        details: { clientSecret: "top-secret", provider: "smtp" },
        store,
    });

    assert.equal(result.id, "event-1");
    assert.equal(writes[0].data.level, "warning");
    assert.equal(writes[0].data.details.clientSecret, "[redacted]");
    assert.equal(writes[0].data.details.provider, "smtp");
});

test("resolveSystemEvent marks only unresolved events", async () => {
    const calls = [];
    const resolvedAt = new Date("2026-07-13T12:00:00.000Z");
    const store = {
        systemEvent: {
            updateMany: async (args) => {
                calls.push(args);
                return { count: args.where.id === "event-1" ? 1 : 0 };
            },
        },
    };

    const result = await resolveSystemEvent({
        id: "event-1",
        resolvedAt,
        store,
    });

    assert.deepEqual(result, {
        resolved: true,
        id: "event-1",
        resolvedAt,
    });
    assert.deepEqual(calls[0], {
        where: {
            id: "event-1",
            resolvedAt: null,
        },
        data: {
            resolvedAt,
        },
    });

    const ignored = await resolveSystemEvent({
        id: "missing",
        resolvedAt,
        store,
    });

    assert.equal(ignored.resolved, false);
});
