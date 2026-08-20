import { roundMoney } from "./fees.js";

export function normalizePromoCode(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

export function calculatePromoDiscount(subtotal, promoCode) {
    const amount = roundMoney(subtotal);
    if (amount <= 0 || !promoCode) return 0;

    const percentOff = Number(promoCode.percentOff || 0);
    const amountOff = Number(promoCode.amountOff || 0);
    const percentDiscount = percentOff > 0 ? amount * (percentOff / 100) : 0;
    const fixedDiscount = amountOff > 0 ? amountOff : 0;

    return roundMoney(Math.min(amount, Math.max(percentDiscount, fixedDiscount)));
}

export function promoCodeAppliesToTicketType(promoCode, ticketTypeId) {
    const ids = Array.isArray(promoCode?.ticketTypeIds) ? promoCode.ticketTypeIds : [];
    if (ids.length === 0) return true;
    return Boolean(ticketTypeId && ids.includes(ticketTypeId));
}

export function getPromoCodeValidationError(promoCode, { now = new Date(), ticketTypeId = null } = {}) {
    if (!promoCode) return "Promo-Code nicht gefunden.";
    if (!promoCode.active) return "Promo-Code ist nicht aktiv.";
    if (promoCode.validFrom && new Date(promoCode.validFrom) > now) {
        return "Promo-Code ist noch nicht gueltig.";
    }
    if (promoCode.validUntil && new Date(promoCode.validUntil) < now) {
        return "Promo-Code ist abgelaufen.";
    }
    if (
        promoCode.maxRedemptions !== null &&
        typeof promoCode.maxRedemptions !== "undefined" &&
        Number(promoCode.redeemedCount || 0) >= Number(promoCode.maxRedemptions)
    ) {
        return "Promo-Code wurde bereits vollstaendig genutzt.";
    }
    if (!promoCodeAppliesToTicketType(promoCode, ticketTypeId)) {
        return "Promo-Code gilt nicht fuer diesen Tickettyp.";
    }
    return null;
}

export function serializePromoCode(promoCode) {
    return {
        id: promoCode.id,
        eventId: promoCode.eventId,
        code: promoCode.code,
        description: promoCode.description ?? null,
        percentOff: promoCode.percentOff ?? null,
        amountOff: promoCode.amountOff ?? null,
        maxRedemptions: promoCode.maxRedemptions ?? null,
        redeemedCount: Number(promoCode.redeemedCount || 0),
        validFrom: promoCode.validFrom ? new Date(promoCode.validFrom).toISOString() : null,
        validUntil: promoCode.validUntil ? new Date(promoCode.validUntil).toISOString() : null,
        active: Boolean(promoCode.active),
        ticketTypeIds: Array.isArray(promoCode.ticketTypeIds) ? promoCode.ticketTypeIds : [],
    };
}
