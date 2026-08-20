import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getScannerSecret as readScannerSecret } from "./env.js";

const SCANNER_PREFIX = "gks2";

function getScannerSecret() {
    return readScannerSecret();
}

function signScannerPayload(payload) {
    return createHmac("sha256", getScannerSecret())
        .update(payload)
        .digest("base64url");
}

function safeEqual(leftValue, rightValue) {
    const left = Buffer.from(leftValue);
    const right = Buffer.from(rightValue);

    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
}

function normalizeEventId(eventId) {
    const normalizedEventId = String(eventId ?? "").trim();
    if (!/^\d+$/.test(normalizedEventId)) {
        throw new Error("eventId is required");
    }

    return normalizedEventId;
}

function getClientIp(request) {
    const forwarded = request?.headers?.get?.("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return request?.headers?.get?.("x-real-ip") ?? null;
}

export function hashScannerToken(rawToken) {
    return createHash("sha256")
        .update(String(rawToken ?? ""))
        .digest("hex");
}

export function createScannerToken({ eventId, scannerLinkId, expiresAt }) {
    const normalizedEventId = normalizeEventId(eventId);
    const linkId = String(scannerLinkId ?? "").trim();
    const expiryMs = new Date(expiresAt).getTime();

    if (!linkId || !Number.isFinite(expiryMs)) {
        throw new Error("scanner link id and expiry are required");
    }

    const payload = `${normalizedEventId}.${linkId}.${expiryMs}`;
    const signature = signScannerPayload(payload);
    return `${SCANNER_PREFIX}.${payload}.${signature}`;
}

export function parseScannerToken(rawToken, expectedEventId) {
    const token = String(rawToken ?? "").trim();
    const normalizedEventId = String(expectedEventId ?? "").trim();
    const parts = token.split(".");

    if (parts.length !== 5 || parts[0] !== SCANNER_PREFIX || !/^\d+$/.test(normalizedEventId)) {
        return null;
    }

    const [, tokenEventId, scannerLinkId, expiryMs, signature] = parts;

    if (tokenEventId !== normalizedEventId || !scannerLinkId || !/^\d+$/.test(expiryMs)) {
        return null;
    }

    const payload = `${tokenEventId}.${scannerLinkId}.${expiryMs}`;
    if (!safeEqual(signature, signScannerPayload(payload))) {
        return null;
    }

    return {
        eventId: Number(tokenEventId),
        scannerLinkId,
        expiresAt: new Date(Number(expiryMs)),
        tokenHash: hashScannerToken(token),
    };
}

export function isScannerLinkUsable(parsed, link, now = new Date()) {
    if (!parsed || !link) {
        return false;
    }

    return (
        link.id === parsed.scannerLinkId &&
        link.eventId === parsed.eventId &&
        link.tokenHash === parsed.tokenHash &&
        !link.revokedAt &&
        parsed.expiresAt > now &&
        link.expiresAt > now
    );
}

export async function verifyScannerToken(rawToken, expectedEventId, options = {}) {
    const parsed = parseScannerToken(rawToken, expectedEventId);
    if (!parsed || parsed.expiresAt <= new Date()) {
        return false;
    }

    const { prisma } = await import("./prisma.js");
    const link = await prisma.eventScannerLink.findUnique({
        where: { tokenHash: parsed.tokenHash },
        select: {
            id: true,
            eventId: true,
            tokenHash: true,
            expiresAt: true,
            revokedAt: true,
        },
    });

    if (!isScannerLinkUsable(parsed, link)) {
        return false;
    }

    if (options.markUsed) {
        await prisma.eventScannerLink.update({
            where: { id: link.id },
            data: {
                lastUsedAt: new Date(),
                lastUsedIp: getClientIp(options.request),
                lastUserAgent: options.request?.headers?.get?.("user-agent") ?? null,
            },
        });
    }

    return true;
}

export function buildScannerPath(eventId, token) {
    return `/scanner/event-${eventId}?token=${encodeURIComponent(token)}`;
}
