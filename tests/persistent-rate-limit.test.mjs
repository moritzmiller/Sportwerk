import assert from "node:assert/strict";
import test from "node:test";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    rateLimitResponse,
} from "../src/lib/persistent-rate-limit.js";

function createStore() {
    const buckets = new Map();
    return {
        buckets,
        async $transaction(callback) {
            return callback({
                rateLimitBucket: {
                    findUnique: async ({ where }) => buckets.get(where.key) ?? null,
                    upsert: async ({ where, create, update }) => {
                        const current = buckets.get(where.key);
                        const next = current ? { ...current, ...update } : { ...create };
                        buckets.set(where.key, next);
                        return next;
                    },
                    updateMany: async ({ where, data }) => {
                        const current = buckets.get(where.key);
                        if (
                            !current ||
                            current.resetAt.getTime() !== where.resetAt.getTime() ||
                            current.count >= where.count.lt
                        ) {
                            return { count: 0 };
                        }
                        buckets.set(where.key, {
                            ...current,
                            count: current.count + data.count.increment,
                        });
                        return { count: 1 };
                    },
                },
            });
        },
    };
}

test("buildRateLimitKey hashes sensitive parts", () => {
    const key = buildRateLimitKey("auth:login", "192.0.2.1", "user@example.com");

    assert.match(key, /^auth:login:[a-f0-9]{32}$/);
    assert.equal(key.includes("192.0.2.1"), false);
    assert.equal(key.includes("user@example.com"), false);
});

test("checkPersistentRateLimit allows requests until the limit is reached", async () => {
    const store = createStore();
    const key = buildRateLimitKey("auth:login", "ip");
    const now = new Date("2026-07-13T10:00:00.000Z");

    const first = await checkPersistentRateLimit({ key, limit: 2, windowMs: 60000, store, now });
    const second = await checkPersistentRateLimit({ key, limit: 2, windowMs: 60000, store, now });
    const third = await checkPersistentRateLimit({ key, limit: 2, windowMs: 60000, store, now });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(third.retryAfterSeconds, 60);
});

test("checkPersistentRateLimit resets expired buckets", async () => {
    const store = createStore();
    const key = buildRateLimitKey("auth:register", "ip");
    const firstWindow = new Date("2026-07-13T10:00:00.000Z");
    const secondWindow = new Date("2026-07-13T10:02:00.000Z");

    await checkPersistentRateLimit({ key, limit: 1, windowMs: 60000, store, now: firstWindow });
    const blocked = await checkPersistentRateLimit({ key, limit: 1, windowMs: 60000, store, now: firstWindow });
    const reset = await checkPersistentRateLimit({ key, limit: 1, windowMs: 60000, store, now: secondWindow });

    assert.equal(blocked.allowed, false);
    assert.equal(reset.allowed, true);
    assert.equal(reset.remaining, 0);
});

test("checkPersistentRateLimit fails closed when the store is unavailable", async () => {
    const store = {
        async $transaction() {
            throw new Error("database unavailable");
        },
    };
    const key = buildRateLimitKey("auth:register", "ip");
    const now = new Date("2026-07-13T10:00:00.000Z");
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const result = await checkPersistentRateLimit({ key, limit: 1, windowMs: 60000, store, now });
        const response = rateLimitResponse("Too many requests.", result);
        const body = await response.json();

        assert.equal(result.allowed, false);
        assert.equal(result.unavailable, true);
        assert.equal(response.status, 503);
        assert.equal(body.code, "RATE_LIMIT_UNAVAILABLE");
    } finally {
        console.error = originalConsoleError;
    }
});
