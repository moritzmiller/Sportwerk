import { EVENT_TYPES, normalizeEventOptions } from "../event-options.js";
import { applyReservationChange } from "../reservations.js";
import { buildRegistrationChargeSummary } from "./registration-batches.js";

const BOOKING_STATUS_BY_ERICH_STATUS = Object.freeze({
    TEMPORARY: "AWAITING_PAYMENT",
    CHECKOUT: "AWAITING_PAYMENT",
    PAID: "PAID",
    COMPLETED: "PAID",
    INVALID: "CANCELLED",
    CANCELLED: "CANCELLED",
});

const PAYMENT_STATUS_BY_ERICH_STATUS = Object.freeze({
    OPEN: "PENDING",
    CHECKOUT_ACTIVE: "REQUIRES_ACTION",
    PENDING: "PENDING",
    SUCCESSFUL: "SUCCEEDED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    EXPIRED: "CANCELLED",
    CHARGED_BACK: "CHARGED_BACK",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    FULLY_REFUNDED: "REFUNDED",
});

const PAYMENT_METHOD_BY_ERICH_PROVIDER = Object.freeze({
    BANK_TRANSFER: "BANK_TRANSFER",
    INVOICE: "INVOICE",
    PAYPAL: "PAYPAL",
    STRIPE: "STRIPE",
    SIMULATED: "BANK_TRANSFER",
});

const PAYMENT_PROVIDER_BY_ERICH_PROVIDER = Object.freeze({
    BANK_TRANSFER: "MANUAL",
    INVOICE: "MANUAL",
    PAYPAL: "PAYPAL",
    STRIPE: "STRIPE",
    SIMULATED: "MANUAL",
});

const EVENT_STATUS_BY_ERICH_STATUS = Object.freeze({
    ACTIVE: "PUBLISHED",
    DRAFT: "DRAFT",
    ARCHIVED: "CANCELLED",
});

export function centsToEuros(cents) {
    return Math.round(Number(cents || 0)) / 100;
}

export function mapErichRegistrationStatus(status) {
    return BOOKING_STATUS_BY_ERICH_STATUS[status] ?? "AWAITING_PAYMENT";
}

export function mapErichPaymentStatus(status) {
    return PAYMENT_STATUS_BY_ERICH_STATUS[status] ?? "PENDING";
}

export function mapErichPaymentMethod(provider) {
    return PAYMENT_METHOD_BY_ERICH_PROVIDER[provider] ?? "BANK_TRANSFER";
}

export function mapErichPaymentProvider(provider) {
    return PAYMENT_PROVIDER_BY_ERICH_PROVIDER[provider] ?? "MANUAL";
}

export function buildUnifiedRegistrationData(batch) {
    const raceEntries = (batch?.raceEntries ?? []).map((entry) => ({
        legacyRaceEntryId: entry.id,
        athleteId: entry.athleteId,
        athleteName: buildPersonName(entry.athlete),
        raceDefinitionId: entry.raceDefinitionId,
        raceNumber: entry.raceNumber,
        classLabel: entry.raceDefinition?.classLabel ?? null,
        distanceLabel: entry.raceDefinition?.distanceLabel ?? null,
        gender: entry.raceDefinition?.gender ?? null,
        targetTimeTotalMs: entry.targetTimeTotalMs ?? null,
        status: entry.status,
        priceCents: entry.priceCents,
        currency: entry.currency ?? "EUR",
        valuations: entry.valuations ?? [],
    }));
    const teamEntries = (batch?.teamEntries ?? []).map((entry) => ({
        legacyTeamEntryId: entry.id,
        teamName: entry.teamName,
        raceDefinitionId: entry.raceDefinitionId,
        raceNumber: entry.raceNumber,
        status: entry.status,
        priceCents: entry.priceCents,
        currency: entry.currency ?? "EUR",
    }));

    return {
        eventType: EVENT_TYPES.ERICH,
        legacySource: {
            type: "ErichRegistrationBatch",
            batchId: batch?.id ?? null,
            erichEventId: batch?.eventId ?? null,
            accountId: batch?.accountId ?? null,
            status: batch?.status ?? null,
        },
        summary: buildRegistrationChargeSummary({
            raceEntries: batch?.raceEntries ?? [],
            teamEntries: batch?.teamEntries ?? [],
            currency: batch?.currency ?? "EUR",
        }),
        raceEntries,
        teamEntries,
    };
}

export function buildErichEventLookup(erichEventId) {
    if (!erichEventId) throw new Error("erichEventId is required.");

    return {
        eventType: EVENT_TYPES.ERICH,
        eventOptions: {
            path: ["legacySource", "erichEventId"],
            equals: erichEventId,
        },
    };
}

export function buildUnifiedEventOptionsFromErichEvent(erichEvent, rawOptions = {}) {
    if (!erichEvent?.id) throw new Error("erichEvent is required.");

    return normalizeEventOptions(EVENT_TYPES.ERICH, {
        ...rawOptions,
        features: {
            ...(rawOptions?.features ?? {}),
            raceRegistration: true,
        },
        legacySource: {
            type: "ErichEvent",
            erichEventId: erichEvent.id,
            slug: erichEvent.slug ?? null,
        },
        raceSelectionMode: rawOptions?.raceSelectionMode ?? "ORDER_FORM",
        ageRuleMode: rawOptions?.ageRuleMode ?? "ORDER_FORM",
    });
}

export function buildUnifiedEventCreateDataFromErichEvent({
    erichEvent,
    ownerId,
    now = new Date(),
    eventOptions = {},
} = {}) {
    if (!erichEvent?.id) throw new Error("erichEvent is required.");
    if (!ownerId) throw new Error("ownerId is required.");

    return {
        title: erichEvent.name ?? erichEvent.slug ?? "ERICH Veranstaltung",
        description: "Migriert aus ERICH Veranstaltung.",
        location: "ERICH",
        city: "Dresden",
        category: "SPORT",
        eventType: EVENT_TYPES.ERICH,
        eventOptions: buildUnifiedEventOptionsFromErichEvent(erichEvent, eventOptions),
        status: EVENT_STATUS_BY_ERICH_STATUS[erichEvent.status] ?? "DRAFT",
        startDate: erichEvent.startsAt ?? now,
        price: 0,
        capacity: null,
        publishedAt: erichEvent.status === "ACTIVE" ? now : null,
        ownerId,
    };
}

export async function findUnifiedEventForErichEvent(tx, erichEventId, select = { id: true }) {
    if (!tx?.event) throw new Error("A Prisma transaction/client with an event delegate is required.");

    return tx.event.findFirst({
        where: buildErichEventLookup(erichEventId),
        select,
    });
}

export async function ensureUnifiedEventForErichEvent(tx, {
    erichEvent,
    ownerId,
    now = new Date(),
    eventOptions = {},
} = {}) {
    if (!tx?.event) throw new Error("A Prisma transaction/client with an event delegate is required.");

    const existing = await findUnifiedEventForErichEvent(tx, erichEvent?.id);
    if (existing) {
        return {
            action: "reused",
            event: existing,
            legacySource: {
                erichEventId: erichEvent.id,
            },
        };
    }

    const event = await tx.event.create({
        data: buildUnifiedEventCreateDataFromErichEvent({
            erichEvent,
            ownerId,
            now,
            eventOptions,
        }),
        select: { id: true },
    });

    return {
        action: "created",
        event,
        legacySource: {
            erichEventId: erichEvent.id,
        },
    };
}

export function buildUnifiedBookingCreateDataFromErichBatch({
    batch,
    eventId,
    ticketType = null,
    now = new Date(),
}) {
    if (!batch?.id) throw new Error("batch is required.");
    if (!Number.isInteger(eventId)) throw new Error("unified numeric eventId is required.");

    const summary = buildRegistrationChargeSummary({
        raceEntries: batch.raceEntries ?? [],
        teamEntries: batch.teamEntries ?? [],
        currency: batch.currency ?? "EUR",
    });
    const quantity = Math.max(1, summary.raceEntryCount + summary.teamEntryCount);
    const subtotalCents = summary.raceEntryCents + summary.teamEntryCents;
    const account = batch.account ?? {};
    const payment = getLatestErichPayment(batch);
    const paymentMethod = mapErichPaymentMethod(payment?.provider);

    return {
        eventId,
        attendeeId: batch.accountId ?? null,
        purchaserName: buildPersonName(account) || account.email || "ERICH Registrierung",
        purchaserEmail: account.email ?? `erich-${batch.id}@legacy.local`,
        purchaserPhone: null,
        notes: "Migriert aus ERICH Registrierung.",
        newsletter: false,
        quantity,
        currency: summary.currency,
        unitPrice: centsToEuros(Math.round(subtotalCents / quantity)),
        serviceFee: centsToEuros(summary.paymentFeeCents),
        discountAmount: 0,
        totalAmount: centsToEuros(summary.totalCents),
        billingName: account.billingName ?? buildPersonName(account) ?? account.email ?? "ERICH Registrierung",
        billingStreet: account.billingStreet ?? "Legacy ERICH",
        billingStreet2: account.billingStreet2 ?? null,
        billingPostalCode: account.billingPostalCode ?? "00000",
        billingCity: account.billingCity ?? "Legacy",
        billingCountry: account.billingCountry ?? "DE",
        paymentMethod,
        paymentProvider: mapErichPaymentProvider(payment?.provider),
        paymentReference: payment?.id ? `ERICH-${payment.id}` : `ERICH-${batch.id}`,
        status: mapErichRegistrationStatus(batch.status),
        paidAt: batch.paidAt ?? null,
        paymentCancelledAt: batch.invalidatedAt ?? null,
        paymentCancellationReason:
            batch.status === "INVALID" || batch.status === "CANCELLED"
                ? `Legacy ERICH status ${batch.status}`
                : null,
        ticketTypeId: ticketType?.id ?? null,
        ticketTypeName: ticketType?.name ?? "ERICH Registrierung",
        registrationData: buildUnifiedRegistrationData(batch),
        createdAt: batch.createdAt ?? now,
        updatedAt: batch.updatedAt ?? now,
    };
}

export function buildUnifiedPaymentCreateDataFromErichPayment({ payment, bookingId }) {
    if (!payment?.id) throw new Error("payment is required.");
    if (!bookingId) throw new Error("bookingId is required.");

    const attempt = payment.attempts?.[0] ?? null;
    const provider = mapErichPaymentProvider(payment.provider);

    return {
        bookingId,
        provider,
        providerPaymentId: payment.providerPaymentId ?? null,
        providerCheckoutId: attempt?.providerAttemptId ?? null,
        method: mapErichPaymentMethod(payment.provider),
        status: mapErichPaymentStatus(payment.status),
        amountCents: Number(payment.amountCents || 0),
        currency: payment.currency ?? "EUR",
        idempotencyKey: `erich-payment:${payment.id}`,
        providerPayload: {
            legacySource: {
                type: "ErichPayment",
                paymentId: payment.id,
                registrationBatchId: payment.registrationBatchId,
                provider: payment.provider,
                status: payment.status,
            },
            latestAttempt: attempt
                ? {
                      id: attempt.id,
                      status: attempt.status,
                      checkoutUrl: attempt.checkoutUrl ?? null,
                      providerPayload: attempt.providerPayload ?? null,
                  }
                : null,
        },
        confirmedAt: payment.status === "SUCCESSFUL" ? payment.updatedAt ?? payment.createdAt ?? null : null,
        cancelledAt:
            payment.status === "CANCELLED" || payment.status === "EXPIRED"
                ? payment.updatedAt ?? null
                : null,
    };
}

export function buildUnifiedTicketCreateDataFromErichEntry({
    entry,
    eventId,
    bookingId,
    ticketNumber,
    ticketType = null,
}) {
    if (!entry?.id) throw new Error("entry is required.");
    if (!Number.isInteger(eventId)) throw new Error("unified numeric eventId is required.");
    if (!bookingId) throw new Error("bookingId is required.");
    if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) {
        throw new Error("ticketNumber must be a positive integer.");
    }

    const athleteName = buildPersonName(entry.athlete);

    return {
        eventId,
        bookingId,
        ticketTypeId: ticketType?.id ?? null,
        ticketTypeName: ticketType?.name ?? "ERICH Registrierung",
        ticketNumber,
        holderName: athleteName || entry.teamName || "ERICH Teilnehmer",
        status: entry.status === "CANCELLED" ? "CANCELLED" : "VALID",
        holderDetails: {
            legacySource: {
                type: entry.teamName ? "ErichTeamEntry" : "ErichRaceEntry",
                entryId: entry.id,
                erichEventId: entry.eventId,
            },
            athleteId: entry.athleteId ?? null,
            athleteName,
            teamName: entry.teamName ?? null,
            raceNumber: entry.raceNumber,
            raceDefinitionId: entry.raceDefinitionId,
            classLabel: entry.raceDefinition?.classLabel ?? null,
            distanceLabel: entry.raceDefinition?.distanceLabel ?? null,
            gender: entry.raceDefinition?.gender ?? null,
            targetTimeTotalMs: entry.targetTimeTotalMs ?? null,
        },
    };
}

export function buildUnifiedMigrationPlanFromErichBatch({
    batch,
    eventId,
    bookingId = "BOOKING_ID_AFTER_CREATE",
    ticketType = null,
    now = new Date(),
}) {
    const booking = buildUnifiedBookingCreateDataFromErichBatch({
        batch,
        eventId,
        ticketType,
        now,
    });
    const latestPayment = getLatestErichPayment(batch);
    const raceTickets = (batch.raceEntries ?? []).map((entry, index) =>
        buildUnifiedTicketCreateDataFromErichEntry({
            entry,
            eventId,
            bookingId,
            ticketNumber: index + 1,
            ticketType,
        })
    );
    const teamTickets = (batch.teamEntries ?? []).map((entry, index) =>
        buildUnifiedTicketCreateDataFromErichEntry({
            entry,
            eventId,
            bookingId,
            ticketNumber: raceTickets.length + index + 1,
            ticketType,
        })
    );

    return {
        booking,
        payment: latestPayment
            ? buildUnifiedPaymentCreateDataFromErichPayment({
                  payment: latestPayment,
                  bookingId,
              })
            : null,
        tickets: [...raceTickets, ...teamTickets],
        legacySource: {
            batchId: batch.id,
            erichEventId: batch.eventId,
        },
    };
}

export function buildErichBatchBookingLookup(batchId) {
    if (!batchId) throw new Error("batchId is required.");

    return {
        registrationData: {
            path: ["legacySource", "batchId"],
            equals: batchId,
        },
    };
}

export async function applyUnifiedMigrationPlanFromErichBatch(tx, {
    batch,
    eventId,
    ticketType = null,
    now = new Date(),
} = {}) {
    if (!tx?.booking || !tx?.ticket || !tx?.payment) {
        throw new Error("A Prisma transaction/client with booking, ticket and payment delegates is required.");
    }
    if (!batch?.id) throw new Error("batch is required.");

    const existingBooking = await tx.booking.findFirst({
        where: buildErichBatchBookingLookup(batch.id),
        select: { id: true },
    });

    if (existingBooking) {
        return {
            action: "skipped",
            reason: "booking-exists",
            bookingId: existingBooking.id,
            legacySource: {
                batchId: batch.id,
                erichEventId: batch.eventId,
            },
        };
    }

    const bookingData = buildUnifiedBookingCreateDataFromErichBatch({
        batch,
        eventId,
        ticketType,
        now,
    });
    const booking = await tx.booking.create({ data: bookingData });

    await applyReservationChange(tx, {
        eventId: booking.eventId,
        previousQuantity: 0,
        nextQuantity: booking.quantity,
        previousTicketTypeId: null,
        nextTicketTypeId: booking.ticketTypeId || null,
    });

    const plan = buildUnifiedMigrationPlanFromErichBatch({
        batch,
        eventId,
        bookingId: booking.id,
        ticketType,
        now,
    });

    if (plan.tickets.length > 0) {
        await tx.ticket.createMany({
            data: plan.tickets,
            skipDuplicates: true,
        });
    }

    let paymentAction = "none";
    if (plan.payment) {
        const existingPayment = await tx.payment.findUnique({
            where: { idempotencyKey: plan.payment.idempotencyKey },
            select: { id: true },
        });

        if (existingPayment) {
            paymentAction = "skipped";
        } else {
            await tx.payment.create({ data: plan.payment });
            paymentAction = "created";
        }
    }

    return {
        action: "created",
        bookingId: booking.id,
        ticketCount: plan.tickets.length,
        paymentAction,
        legacySource: plan.legacySource,
    };
}

function getLatestErichPayment(batch) {
    return Array.isArray(batch?.payments) && batch.payments.length > 0 ? batch.payments[0] : null;
}

function buildPersonName(person) {
    return [person?.firstName ?? person?.name, person?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
}
