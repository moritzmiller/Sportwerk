import { createHmac, timingSafeEqual } from "crypto";
import { getTicketSecret } from "./env.js";

const BOOKING_ACCESS_PREFIX = "gkb1";

function getBookingAccessSecret() {
    return getTicketSecret();
}

function toCreatedAtMs(value) {
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    return Number.isFinite(ms) ? String(ms) : null;
}

function sign(payload) {
    return createHmac("sha256", getBookingAccessSecret())
        .update(`booking-access:${payload}`)
        .digest("base64url");
}

function safeEqual(leftValue, rightValue) {
    const left = Buffer.from(String(leftValue ?? ""));
    const right = Buffer.from(String(rightValue ?? ""));

    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
}

export function createBookingAccessToken(booking) {
    const bookingId = String(booking?.id ?? "").trim();
    const createdAtMs = toCreatedAtMs(booking?.createdAt);

    if (!bookingId || !createdAtMs) {
        throw new Error("booking id and createdAt are required");
    }

    const payload = `${bookingId}.${createdAtMs}`;
    return `${BOOKING_ACCESS_PREFIX}.${payload}.${sign(payload)}`;
}

export function verifyBookingAccessToken(rawToken, booking) {
    const token = String(rawToken ?? "").trim();
    const bookingId = String(booking?.id ?? "").trim();
    const createdAtMs = toCreatedAtMs(booking?.createdAt);
    const parts = token.split(".");

    if (!bookingId || !createdAtMs || parts.length !== 4 || parts[0] !== BOOKING_ACCESS_PREFIX) {
        return false;
    }

    const [, tokenBookingId, tokenCreatedAtMs, signature] = parts;
    if (tokenBookingId !== bookingId || tokenCreatedAtMs !== createdAtMs) {
        return false;
    }

    const payload = `${tokenBookingId}.${tokenCreatedAtMs}`;
    return safeEqual(signature, sign(payload));
}
