const SECRET_KEY_PATTERN = /pass|password|secret|token|key|authorization|cookie|apikey|api_key|client_secret/i;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 4;

function clip(value) {
    const text = String(value ?? "");
    return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH)}...` : text;
}

export function sanitizeSystemEventDetails(value, depth = 0) {
    if (value === null || typeof value === "undefined") return null;
    if (depth > MAX_DEPTH) return "[truncated]";

    if (value instanceof Error) {
        return {
            name: value.name,
            message: clip(value.message),
            code: value.code ?? null,
            status: value.status ?? null,
        };
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return typeof value === "string" ? clip(value) : value;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 20).map((entry) => sanitizeSystemEventDetails(entry, depth + 1));
    }

    if (typeof value === "object") {
        const output = {};
        for (const [key, entry] of Object.entries(value).slice(0, 40)) {
            output[key] = SECRET_KEY_PATTERN.test(key)
                ? "[redacted]"
                : sanitizeSystemEventDetails(entry, depth + 1);
        }
        return output;
    }

    return clip(value);
}

async function getPrisma() {
    const { prisma } = await import("./prisma.js");
    return prisma;
}

export async function logSystemEvent({
    level = "error",
    area = "system",
    message,
    details = null,
    store = null,
}) {
    const normalizedMessage = clip(message || "System event");
    const normalizedLevel = ["info", "warning", "error"].includes(level) ? level : "error";
    const normalizedArea = clip(area || "system").slice(0, 80);

    try {
        const prisma = store ?? (await getPrisma());
        return await prisma.systemEvent.create({
            data: {
                level: normalizedLevel,
                area: normalizedArea,
                message: normalizedMessage,
                details: sanitizeSystemEventDetails(details),
            },
        });
    } catch (error) {
        console.error("[SystemEvent] Persist failed:", error?.message || error);
        return null;
    }
}

export async function resolveSystemEvent({
    id,
    store = null,
    resolvedAt = new Date(),
} = {}) {
    const eventId = String(id ?? "").trim();
    if (!eventId) {
        throw new Error("System event id is required.");
    }

    const prisma = store ?? (await getPrisma());
    const result = await prisma.systemEvent.updateMany({
        where: {
            id: eventId,
            resolvedAt: null,
        },
        data: {
            resolvedAt,
        },
    });

    return {
        resolved: result.count === 1,
        id: eventId,
        resolvedAt,
    };
}
