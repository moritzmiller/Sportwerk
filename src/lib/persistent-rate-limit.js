import { createHash } from "crypto";

function secondsUntil(date, nowMs = Date.now()) {
    return Math.max(1, Math.ceil((new Date(date).getTime() - nowMs) / 1000));
}

async function getDefaultStore() {
    const { prisma } = await import("./prisma.js");
    return prisma;
}

function stableHash(value) {
    return createHash("sha256")
        .update(String(value ?? ""))
        .digest("hex")
        .slice(0, 32);
}

export function getClientIp(request) {
    const forwardedFor = request?.headers?.get?.("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
    return (
        request?.headers?.get?.("x-real-ip") ||
        request?.headers?.get?.("cf-connecting-ip") ||
        "unknown"
    );
}

export function buildRateLimitKey(scope, ...parts) {
    const normalizedScope = String(scope || "default")
        .toLowerCase()
        .replace(/[^a-z0-9:-]/g, "-")
        .slice(0, 80);
    const fingerprint = stableHash(parts.filter(Boolean).join(":"));
    return `${normalizedScope}:${fingerprint}`;
}

export async function checkPersistentRateLimit({
    key,
    limit,
    windowMs,
    store = null,
    now = new Date(),
}) {
    if (!key || !Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
        throw new Error("Invalid persistent rate limit policy.");
    }

    const resetAt = new Date(now.getTime() + windowMs);

    const rateLimitStore = store ?? (await getDefaultStore());

    try {
        return await rateLimitStore.$transaction(async (tx) => {
            const current = await tx.rateLimitBucket.findUnique({
                where: { key },
            });

            if (!current || current.resetAt <= now) {
                await tx.rateLimitBucket.upsert({
                    where: { key },
                    create: { key, count: 1, resetAt },
                    update: { count: 1, resetAt },
                });
                return {
                    allowed: true,
                    limit,
                    remaining: Math.max(0, limit - 1),
                    retryAfterSeconds: 0,
                    resetAt,
                };
            }

            if (current.count >= limit) {
                return {
                    allowed: false,
                    limit,
                    remaining: 0,
                    retryAfterSeconds: secondsUntil(current.resetAt, now.getTime()),
                    resetAt: current.resetAt,
                };
            }

            const result = await tx.rateLimitBucket.updateMany({
                where: {
                    key,
                    resetAt: current.resetAt,
                    count: { lt: limit },
                },
                data: {
                    count: { increment: 1 },
                },
            });

            if (result.count !== 1) {
                return {
                    allowed: false,
                    limit,
                    remaining: 0,
                    retryAfterSeconds: secondsUntil(current.resetAt, now.getTime()),
                    resetAt: current.resetAt,
                };
            }

            return {
                allowed: true,
                limit,
                remaining: Math.max(0, limit - current.count - 1),
                retryAfterSeconds: 0,
                resetAt: current.resetAt,
            };
        });
    } catch (error) {
        console.error("[RateLimit] Persistent store unavailable:", error);
        return {
            allowed: false,
            unavailable: true,
            limit,
            remaining: 0,
            retryAfterSeconds: 30,
            resetAt: new Date(now.getTime() + 30 * 1000),
        };
    }
}

export function rateLimitResponse(message, result) {
    if (result.unavailable) {
        return Response.json(
            {
                error:
                    "Der Dienst ist gerade nicht vollstÃ¤ndig erreichbar. Bitte versuche es gleich erneut.",
                code: "RATE_LIMIT_UNAVAILABLE",
                retryAfterSeconds: result.retryAfterSeconds,
            },
            {
                status: 503,
                headers: {
                    "Retry-After": String(result.retryAfterSeconds),
                },
            }
        );
    }

    return Response.json(
        {
            error: message,
            code: "RATE_LIMITED",
            retryAfterSeconds: result.retryAfterSeconds,
        },
        {
            status: 429,
            headers: {
                "Retry-After": String(result.retryAfterSeconds),
                "X-RateLimit-Limit": String(result.limit),
                "X-RateLimit-Remaining": String(result.remaining),
                "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
            },
        }
    );
}
