const SECRET_KEY_PATTERN = /pass|password|secret|token|key|authorization|cookie|apikey|api_key|client_secret|ticketId/i;
const TECHNICAL_FILE_PATTERN = /portraitFileAssetId|pdfFileAssetId|fileAssetId|storageKey/i;
const PROTECTED_HEALTH_PATTERN = /parasport|disability|medical/i;
const MAX_STRING_LENGTH = 700;
const MAX_DEPTH = 5;
const CRITICAL_ACTION_PATTERN =
    /role|price|race|license|eligibility|payment|refund|invoice|credit|ticket|document|export|import|emergency|configuration|bulk/i;

function clip(value) {
    const text = String(value ?? "");
    return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH)}...` : text;
}

function sanitizeEntry(key, value, depth) {
    if (SECRET_KEY_PATTERN.test(key) || TECHNICAL_FILE_PATTERN.test(key)) {
        return "[redacted]";
    }

    if (PROTECTED_HEALTH_PATTERN.test(key)) {
        return "[redacted]";
    }

    return sanitizeErichAuditValue(value, depth + 1);
}

export function sanitizeErichAuditValue(value, depth = 0) {
    if (value === null || typeof value === "undefined") return null;
    if (depth > MAX_DEPTH) return "[truncated]";

    if (value instanceof Date) return value.toISOString();

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
        return value.slice(0, 50).map((entry) => sanitizeErichAuditValue(entry, depth + 1));
    }

    if (typeof value === "object") {
        const output = {};
        for (const [key, entry] of Object.entries(value).slice(0, 80)) {
            output[key] = sanitizeEntry(key, entry, depth);
        }
        return output;
    }

    return clip(value);
}

export function isCriticalErichAuditAction(action) {
    return CRITICAL_ACTION_PATTERN.test(String(action ?? ""));
}

export function requireErichAuditReason({ action, reason, critical = false }) {
    const needsReason = critical || isCriticalErichAuditAction(action);
    const normalizedReason = String(reason ?? "").trim();

    if (needsReason && normalizedReason.length < 5) {
        const error = new Error("ERICH audit reason is required for critical changes.");
        error.code = "ERICH_AUDIT_REASON_REQUIRED";
        error.action = action;
        throw error;
    }

    return normalizedReason || null;
}

export function buildErichAuditEntry({
    eventId = null,
    actorId = null,
    entityType,
    entityId = null,
    action,
    reason = null,
    oldValue = null,
    newValue = null,
    metadata = null,
    critical = false,
}) {
    if (!entityType) throw new Error("entityType is required.");
    if (!action) throw new Error("action is required.");

    return {
        eventId,
        actorId,
        entityType: String(entityType),
        entityId,
        action: String(action),
        reason: requireErichAuditReason({ action, reason, critical }),
        oldValue: sanitizeErichAuditValue(oldValue),
        newValue: sanitizeErichAuditValue(newValue),
        metadata: sanitizeErichAuditValue(metadata),
    };
}

async function getPrisma() {
    const { prisma } = await import("../prisma.js");
    return prisma;
}

export async function writeErichAuditLog({ store = null, ...entryInput }) {
    const prisma = store ?? (await getPrisma());
    const entry = buildErichAuditEntry(entryInput);

    return prisma.erichAuditLog.create({
        data: entry,
    });
}
