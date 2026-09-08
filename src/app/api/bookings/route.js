import { getOptionalCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBookingTotals } from "@/lib/bookings";
import {
    isPaymentMethodAllowed,
    normalizePaymentMethod,
    requiresBillingAddressForCheckout,
} from "@/lib/payment-methods";
import { canReserveSeats, getReservationDelta } from "@/lib/capacity";
import { normalizeRegistrationAnswers } from "@/lib/event-options";
import {
    createFallbackTicketType,
    resolveRequestedTicketType,
} from "@/lib/ticket-types";
import {
    calculatePromoDiscount,
    getPromoCodeValidationError,
    normalizePromoCode,
} from "@/lib/promo-codes";
import {
    isBotTrapTriggered,
    isValidEmail,
    normalizeEmail,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";
import {
    buildRateLimitKey,
    checkPersistentRateLimit,
    getClientIp,
    rateLimitResponse,
} from "@/lib/persistent-rate-limit";
import {
    applyReservationChange,
    isReservationCapacityError,
} from "@/lib/reservations";
import {
    startEventBookingCheckoutPayment,
} from "@/lib/checkout-payments";

function jsonError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

function normalizeText(value) {
    return normalizeSafeText(value, { maxLength: 500 });
}

function getTicketTypeForSelection(event, requestedTicketTypeId) {
    const resolved = resolveRequestedTicketType(event, requestedTicketTypeId);

    if (resolved) {
        return resolved;
    }

    if (event.ticketTypes?.length > 0) {
        return null;
    }

    return createFallbackTicketType(event);
}

export async function POST(request) {
    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 64 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    if (isBotTrapTriggered(body, { minElapsedMs: 1200 })) {
        return jsonError("Die Buchung konnte nicht vorbereitet werden.", 400);
    }

    const eventId = Number(body.eventId);
    const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
    const purchaserEmail = normalizeEmail(body.purchaserEmail);
    const purchaserName = normalizeSafeText(body.purchaserName, { maxLength: 120 });
    const requestedTicketTypeId = normalizeText(body.ticketTypeId) || null;
    const requestedPromoCode = normalizePromoCode(body.promoCode);

    if (!eventId) {
        return jsonError("Event fehlt.");
    }

    if (!purchaserName || !isValidEmail(purchaserEmail)) {
        return jsonError("Name und gültige E-Mail sind erforderlich.");
    }

    if (!body.termsAccepted) {
        return jsonError("Bitte die Bedingungen akzeptieren.");
    }

    const rateLimit = await checkPersistentRateLimit({
        key: buildRateLimitKey("bookings:create", getClientIp(request), purchaserEmail, eventId),
        limit: 10,
        windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return rateLimitResponse(
            "Zu viele Buchungsversuche. Bitte warte kurz und versuche es erneut.",
            rateLimit
        );
    }

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            owner: true,
            ticketTypes: {
                orderBy: [
                    { isDefault: "desc" },
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
                ],
            },
        },
    });

    if (!event) {
        return jsonError("Event nicht gefunden.", 404);
    }

    if (new Date(event.startDate) < new Date()) {
        return jsonError("Dieses Event ist bereits vorbei.", 400);
    }

    if (event.status !== "PUBLISHED") {
        return jsonError("Dieses Event ist aktuell nicht buchbar.", 400);
    }

    const selectedTicketType = getTicketTypeForSelection(event, requestedTicketTypeId);
    if (!selectedTicketType) {
        return jsonError("Tickettyp nicht gefunden.", 404);
    }

    if (selectedTicketType.maxPerBooking && quantity > Number(selectedTicketType.maxPerBooking)) {
        return jsonError(
            `Für diesen Tickettyp sind maximal ${selectedTicketType.maxPerBooking} Tickets pro Buchung möglich.`,
            400
        );
    }

    const currentUser = await getOptionalCurrentUser();
    const billingName =
        normalizeText(body.billingName) || currentUser?.billingName || purchaserName;
    const billingStreet =
        normalizeText(body.billingStreet) || currentUser?.billingStreet || null;
    const billingStreet2 =
        normalizeText(body.billingStreet2) || currentUser?.billingStreet2 || null;
    const billingPostalCode =
        normalizeText(body.billingPostalCode) || currentUser?.billingPostalCode || null;
    const billingCity =
        normalizeText(body.billingCity) || currentUser?.billingCity || null;
    const billingCountry = (
        normalizeText(body.billingCountry) || currentUser?.billingCountry || "DE"
    ).toUpperCase();
    const paymentMethod = normalizePaymentMethod(
        body.paymentMethod ?? currentUser?.preferredPaymentMethod,
        "STRIPE"
    );
    let promoCode = null;
    let discountAmount = 0;

    if (requestedPromoCode) {
        promoCode = await prisma.promoCode.findFirst({
            where: {
                eventId: event.id,
                code: requestedPromoCode,
            },
        });

        const promoError = getPromoCodeValidationError(promoCode, {
            ticketTypeId: selectedTicketType.id || null,
        });
        if (promoError) {
            return jsonError(promoError, 400);
        }

        discountAmount = calculatePromoDiscount(
            Number(selectedTicketType.price || 0) * quantity,
            promoCode
        );
    }

    const totals = calculateBookingTotals(selectedTicketType.price, quantity, discountAmount);
    const registration = normalizeRegistrationAnswers(event, body.registrationAnswers);
    if (registration.errors.length > 0) {
        return jsonError(registration.errors[0], 400);
    }

    if (!isPaymentMethodAllowed(event, paymentMethod)) {
        return jsonError("Diese Zahlungsmethode ist fuer dieses Event nicht freigegeben.", 400);
    }

    const currentReserved = Number(event.soldTickets || 0);
    if (!canReserveSeats(event, quantity, currentReserved)) {
        return jsonError("Für dieses Event sind nicht mehr genügend Plätze frei.", 400);
    }

    if (
        requiresBillingAddressForCheckout(paymentMethod, totals.totalAmount) &&
        (!billingName || !billingStreet || !billingPostalCode || !billingCity)
    ) {
        return jsonError("Bitte die Rechnungsadresse vollständig ausfüllen.");
    }

    const recentPending = await prisma.booking.findFirst({
        where: {
            eventId: event.id,
            purchaserEmail,
            paymentMethod,
            status: "AWAITING_PAYMENT",
            createdAt: {
                gte: new Date(Date.now() - 15 * 60 * 1000),
            },
        },
        orderBy: { createdAt: "desc" },
    });

    let booking = recentPending;
    if (booking) {
        const previousQuantity = booking.quantity;
        const previousTicketTypeId = booking.ticketTypeId || null;
        const nextTicketTypeId = selectedTicketType.id || null;
        const paymentMethodChanged = booking.paymentMethod !== paymentMethod;
        const promoChanged = (booking.promoCodeId || null) !== (promoCode?.id || null);
        const delta = getReservationDelta(previousQuantity, totals.quantity);
        if (delta > 0 && !canReserveSeats(event, delta, currentReserved)) {
            return jsonError("Für dieses Event sind nicht mehr genügend Plätze frei.", 400);
        }

        if (selectedTicketType.quota !== null) {
            const currentTicketTypeReserved = Number(selectedTicketType.soldCount || 0);
            const nextReserved =
                previousTicketTypeId && previousTicketTypeId === nextTicketTypeId
                    ? currentTicketTypeReserved + delta
                    : currentTicketTypeReserved + totals.quantity;

            if (nextReserved > Number(selectedTicketType.quota || 0)) {
                return jsonError(
                    "Für diesen Tickettyp sind nicht mehr genügend Plätze frei.",
                    400
                );
            }
        }

        try {
            booking = await prisma.$transaction(async (tx) => {
                let updatedBooking = await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        attendeeId: currentUser?.id ?? booking.attendeeId,
                        purchaserName,
                        purchaserPhone: body.purchaserPhone
                            ? normalizeSafeText(body.purchaserPhone, { maxLength: 40 })
                            : null,
                        notes: body.notes ? normalizeSafeText(body.notes, { maxLength: 1000 }) : null,
                        newsletter: Boolean(body.newsletter),
                        quantity: totals.quantity,
                        currency: totals.currency,
                        unitPrice: totals.unitPrice,
                        discountAmount: totals.discountAmount,
                        serviceFee: totals.serviceFee,
                        totalAmount: totals.totalAmount,
                        billingName,
                        billingStreet,
                        billingStreet2,
                        billingPostalCode,
                        billingCity,
                        billingCountry,
                        paymentMethod,
                        paymentProvider: paymentMethod,
                        ticketTypeId: nextTicketTypeId,
                        ticketTypeName: selectedTicketType.name,
                        promoCodeId: promoCode?.id ?? null,
                        promoCode: promoCode?.code ?? null,
                        registrationData: registration.data,
                    },
                });

                await applyReservationChange(tx, {
                    eventId: event.id,
                    previousQuantity,
                    nextQuantity: totals.quantity,
                    previousTicketTypeId,
                    nextTicketTypeId,
                });

                if (delta !== 0 || previousTicketTypeId !== nextTicketTypeId || paymentMethodChanged || promoChanged) {
                    updatedBooking = await tx.booking.update({
                        where: { id: updatedBooking.id },
                        data: {
                            paypalOrderId: null,
                            paypalApprovalUrl: null,
                            paypalStatus: null,
                            stripeCheckoutSessionId: null,
                            stripePaymentIntentId: null,
                            stripeStatus: null,
                            providerPayload: null,
                        },
                    });
                }

                return updatedBooking;
            });
        } catch (error) {
            if (isReservationCapacityError(error)) {
                return jsonError("Für dieses Event sind nicht mehr genügend Plätze frei.", 409);
            }
            throw error;
        }
    } else {
        try {
            booking = await prisma.$transaction(async (tx) => {
                const created = await tx.booking.create({
                    data: {
                        eventId: event.id,
                        attendeeId: currentUser?.id ?? null,
                        purchaserName,
                        purchaserEmail,
                        purchaserPhone: body.purchaserPhone
                            ? normalizeSafeText(body.purchaserPhone, { maxLength: 40 })
                            : null,
                        notes: body.notes ? normalizeSafeText(body.notes, { maxLength: 1000 }) : null,
                        newsletter: Boolean(body.newsletter),
                        quantity: totals.quantity,
                        currency: totals.currency,
                        unitPrice: totals.unitPrice,
                        discountAmount: totals.discountAmount,
                        serviceFee: totals.serviceFee,
                        totalAmount: totals.totalAmount,
                        billingName,
                        billingStreet,
                        billingStreet2,
                        billingPostalCode,
                        billingCity,
                        billingCountry,
                        paymentMethod,
                        ticketTypeId: selectedTicketType.id || null,
                        ticketTypeName: selectedTicketType.name,
                        promoCodeId: promoCode?.id ?? null,
                        promoCode: promoCode?.code ?? null,
                        status: "AWAITING_PAYMENT",
                        paymentProvider: paymentMethod,
                        registrationData: registration.data,
                    },
                });

                await applyReservationChange(tx, {
                    eventId: event.id,
                    previousQuantity: 0,
                    nextQuantity: totals.quantity,
                    previousTicketTypeId: null,
                    nextTicketTypeId: selectedTicketType.id || null,
                });

                return created;
            });
        } catch (error) {
            if (isReservationCapacityError(error)) {
                return jsonError("Für dieses Event sind nicht mehr genügend Plätze frei.", 409);
            }
            throw error;
        }
    }

    const checkoutPayment = await startEventBookingCheckoutPayment({
        request,
        booking,
        event,
        totals,
        paymentMethod,
        purchaserEmail,
    });

    return checkoutPayment.response;
}
