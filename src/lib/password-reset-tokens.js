import { createHmac, timingSafeEqual } from "crypto";
import { getScannerSecret } from "./env.js";

const RESET_PREFIX = "gkr1";
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function encodeJson(value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value) {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signPayload(payload) {
    return createHmac("sha256", getScannerSecret())
        .update(payload)
        .digest("base64url");
}

function safeEqual(leftValue, rightValue) {
    const left = Buffer.from(String(leftValue || ""));
    const right = Buffer.from(String(rightValue || ""));

    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
}

export function createPasswordResetToken({ userId, email, now = new Date(), ttlMs = DEFAULT_TTL_MS }) {
    const normalizedUserId = String(userId || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const issuedAt = now.getTime();

    if (!normalizedUserId || !normalizedEmail) {
        throw new Error("userId and email are required");
    }

    const payload = encodeJson({
        sub: normalizedUserId,
        email: normalizedEmail,
        iat: issuedAt,
        exp: issuedAt + ttlMs,
    });
    const signature = signPayload(payload);

    return `${RESET_PREFIX}.${payload}.${signature}`;
}

export function verifyPasswordResetToken(rawToken, now = new Date()) {
    const token = String(rawToken || "").trim();
    const parts = token.split(".");

    if (parts.length !== 3 || parts[0] !== RESET_PREFIX) {
        return { ok: false, reason: "format" };
    }

    const [, payload, signature] = parts;
    if (!safeEqual(signature, signPayload(payload))) {
        return { ok: false, reason: "signature" };
    }

    let data;
    try {
        data = decodeJson(payload);
    } catch {
        return { ok: false, reason: "payload" };
    }

    if (!data?.sub || !data?.email || !Number.isFinite(data?.exp)) {
        return { ok: false, reason: "payload" };
    }

    if (data.exp <= now.getTime()) {
        return { ok: false, reason: "expired" };
    }

    return {
        ok: true,
        userId: String(data.sub),
        email: String(data.email).toLowerCase(),
        expiresAt: new Date(data.exp),
    };
}
