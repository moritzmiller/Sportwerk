import { createHmac, timingSafeEqual } from "crypto";
import { getTicketSecret as readTicketSecret } from "./env.js";

const BOOKING_TICKET_PREFIX = "gk1";
const INDIVIDUAL_TICKET_PREFIX = "gkt1";
const LEGACY_PREFIX = "gatekeeper-ticket-";

function getTicketSecret() {
    return readTicketSecret();
}

function toUrlSafeSignature(payload) {
    return createHmac("sha256", getTicketSecret())
        .update(payload)
        .digest("base64url");
}

function safeEqual(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
}

export function createTicketCode(bookingId) {
    const normalizedId = String(bookingId ?? "").trim();

    if (!normalizedId) {
        throw new Error("bookingId is required");
    }

    const signature = toUrlSafeSignature(normalizedId);
    return `${BOOKING_TICKET_PREFIX}.${normalizedId}.${signature}`;
}

export function createIndividualTicketCode(ticketId) {
    const normalizedId = String(ticketId ?? "").trim();

    if (!normalizedId) {
        throw new Error("ticketId is required");
    }

    const payload = `${INDIVIDUAL_TICKET_PREFIX}.${normalizedId}`;
    const signature = toUrlSafeSignature(payload);
    return `${payload}.${signature}`;
}

export async function ensureTicketsForBooking(tx, booking) {
    if (!tx?.ticket || !booking?.id) {
        return { action: "ignored", reason: "ticket-delegate-unavailable" };
    }

    const quantity = Math.max(1, Number(booking.quantity || 1));
    const existing = await tx.ticket.findMany({
        where: { bookingId: booking.id },
        select: { ticketNumber: true },
    });
    const existingNumbers = new Set(existing.map((ticket) => Number(ticket.ticketNumber)));
    const missing = [];

    for (let ticketNumber = 1; ticketNumber <= quantity; ticketNumber += 1) {
        if (!existingNumbers.has(ticketNumber)) {
            missing.push({
                eventId: booking.eventId,
                bookingId: booking.id,
                ticketTypeId: booking.ticketTypeId || null,
                ticketTypeName: booking.ticketTypeName || null,
                ticketNumber,
                holderName: booking.purchaserName || null,
                status: "VALID",
            });
        }
    }

    if (missing.length === 0) {
        return { action: "ignored", reason: "tickets-exist", count: existing.length };
    }

    await tx.ticket.createMany({
        data: missing,
        skipDuplicates: true,
    });

    return { action: "created", count: missing.length };
}

export async function markTicketsForBooking(tx, bookingId, status, data = {}) {
    if (!tx?.ticket || !bookingId) {
        return { action: "ignored", reason: "ticket-delegate-unavailable" };
    }

    const result = await tx.ticket.updateMany({
        where: { bookingId },
        data: {
            ...data,
            status,
        },
    });

    return { action: result.count > 0 ? "updated" : "ignored", count: result.count };
}

export function normalizeTicketInput(rawValue) {
    const text = String(rawValue ?? "").trim();

    if (!text) {
        return null;
    }

    const urlMatch = text.match(/\/booking\/([^/?#]+)/i);
    if (urlMatch?.[1]) {
        return decodeURIComponent(urlMatch[1]);
    }

    if (text.startsWith(LEGACY_PREFIX)) {
        return text.slice(LEGACY_PREFIX.length).trim() || null;
    }

    return text;
}

export function verifyTicketCode(rawValue) {
    const normalized = normalizeTicketInput(rawValue);
    if (!normalized) {
        return { ok: false, bookingId: null, ticketId: null, normalized: null, format: "empty" };
    }

    const parts = normalized.split(".");
    if (parts.length === 3 && parts[0] === BOOKING_TICKET_PREFIX) {
        const [, bookingId, signature] = parts;
        const expected = toUrlSafeSignature(bookingId);

        return {
            ok: safeEqual(signature, expected),
            bookingId,
            ticketId: null,
            normalized,
            format: "signed",
        };
    }

    if (parts.length === 3 && parts[0] === INDIVIDUAL_TICKET_PREFIX) {
        const [, ticketId, signature] = parts;
        const payload = `${INDIVIDUAL_TICKET_PREFIX}.${ticketId}`;
        const expected = toUrlSafeSignature(payload);

        return {
            ok: safeEqual(signature, expected),
            bookingId: null,
            ticketId,
            normalized,
            format: "signed",
        };
    }

    if (/^\d+$/.test(normalized)) {
        return {
            ok: true,
            bookingId: normalized,
            ticketId: null,
            normalized,
            format: "legacy-id",
        };
    }

    return {
        ok: false,
        bookingId: null,
        ticketId: null,
        normalized,
        format: "unknown",
    };
}
