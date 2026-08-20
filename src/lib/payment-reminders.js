import { getManualPaymentDueDate, isManualPaymentMethod } from "@/lib/manual-payments";

function parseIntegerList(value) {
    return String(value ?? "")
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry > 0)
        .sort((a, b) => a - b);
}

export function getPaymentReminderIntervals() {
    const parsed = parseIntegerList(process.env.PAYMENT_REMINDER_INTERVALS);
    return parsed.length > 0 ? parsed : [3, 7, 14];
}

export function getPaymentAutoCancelDays() {
    const value = Number(process.env.PAYMENT_AUTO_CANCEL_AFTER_DAYS || 30);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
}

export function getDaysSince(referenceDate, now = new Date()) {
    const ref = new Date(referenceDate);
    const diff = now.getTime() - ref.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function getPaymentReminderState(booking, now = new Date()) {
    const intervals = getPaymentReminderIntervals();
    const autoCancelDays = getPaymentAutoCancelDays();
    const reminderCount = Number(booking.paymentReminderCount || 0);
    const nextThreshold = intervals[reminderCount] ?? null;
    const baseDate = booking.lastPaymentReminderAt ?? booking.createdAt;
    const ageDays = getDaysSince(baseDate, now);
    const createdAgeDays = getDaysSince(booking.createdAt, now);
    const dueDate = getManualPaymentDueDate(booking.createdAt);
    const overdueDays = Math.max(0, getDaysSince(dueDate, now));
    const isManualOpen =
        booking.status === "AWAITING_PAYMENT" &&
        isManualPaymentMethod(booking.paymentMethod);
    const isOverdueForCancellation =
        isManualOpen && createdAgeDays >= autoCancelDays;
    const dueForReminder =
        isManualOpen &&
        nextThreshold !== null &&
        createdAgeDays >= nextThreshold &&
        ageDays >= 1;

    return {
        intervals,
        reminderCount,
        nextThreshold,
        baseDate,
        ageDays,
        createdAgeDays,
        dueDate,
        overdueDays,
        isManualOpen,
        autoCancelDays,
        isOverdueForCancellation,
        dueForReminder,
    };
}

export function getPaymentReminderSummary(booking, now = new Date()) {
    const state = getPaymentReminderState(booking, now);

    if (!state.isManualOpen) {
        return {
            kind: "none",
            label: "Keine manuelle Zahlung offen",
            value: null,
        };
    }

    if (state.nextThreshold === null) {
        return {
            kind: "finished",
            label: "Alle Erinnerungen gesendet",
            value: `Seit ${state.reminderCount} Versand(en)`,
        };
    }

    if (state.dueForReminder) {
        return {
            kind: "due",
            label: "Erinnerung fällig",
            value: `seit ${state.createdAgeDays} Tagen offen`,
        };
    }

    const remaining = Math.max(0, state.nextThreshold - state.createdAgeDays);

    return {
        kind: "waiting",
        label: "Nächste Erinnerung",
        value: remaining === 0 ? "heute" : `in ${remaining} Tagen`,
    };
}

export function getPaymentAutoCancelSummary(booking, now = new Date()) {
    const state = getPaymentReminderState(booking, now);

    if (!state.isManualOpen) {
        return {
            kind: "none",
            label: "Keine offene manuelle Zahlung",
            value: null,
        };
    }

    if (state.isOverdueForCancellation) {
        const overdue = Math.max(0, state.createdAgeDays - state.autoCancelDays);
        return {
            kind: "cancel",
            label: "Auto-Storno fällig",
            value: overdue > 0 ? `seit ${overdue} Tagen überfällig` : "heute",
        };
    }

    const remaining = Math.max(0, state.autoCancelDays - state.createdAgeDays);
    return {
        kind: "waiting",
        label: "Automatisches Storno",
        value: remaining === 0 ? "heute" : `in ${remaining} Tagen`,
    };
}
