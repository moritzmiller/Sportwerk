import {
    formatMoney,
    getPaymentMethodLabel,
} from "@/lib/bookings";
import {
    getPaymentAutoCancelSummary,
    getPaymentReminderState,
} from "@/lib/payment-reminders";

export const ADMIN_PAYMENT_VIEWS = [
    { value: "all", label: "Alle" },
    { value: "due", label: "Erinnerung fällig" },
    { value: "cancel", label: "Auto-Storno fällig" },
    { value: "invoice", label: "Rechnungen" },
    { value: "transfer", label: "Überweisungen" },
    { value: "overdue-invoice", label: "Überfällige Rechnungen" },
    { value: "overdue-transfer", label: "Überfällige Überweisungen" },
];

export const ADMIN_PAYMENT_STATUSES = [
    { value: "open", label: "Offen" },
    { value: "overdue", label: "Überfällig" },
    { value: "cancelled", label: "Storniert" },
    { value: "refunded", label: "Erstattet" },
    { value: "all", label: "Alle" },
];

const MANUAL_PAYMENT_METHODS = ["INVOICE", "BANK_TRANSFER"];

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + Number(days || 0));
    return next;
}

export function normalizeAdminPaymentView(value) {
    return ADMIN_PAYMENT_VIEWS.some((option) => option.value === value) ? value : "all";
}

export function normalizeAdminPaymentStatus(value) {
    return ADMIN_PAYMENT_STATUSES.some((option) => option.value === value) ? value : "open";
}

export function getAdminPaymentQueryWhere(status) {
    if (status === "cancelled") {
        return {
            status: "CANCELLED",
            paymentMethod: {
                in: MANUAL_PAYMENT_METHODS,
            },
        };
    }

    if (status === "refunded") {
        return {
            status: "REFUNDED",
            paymentMethod: {
                in: MANUAL_PAYMENT_METHODS,
            },
        };
    }

    if (status === "all") {
        return {
            status: {
                in: ["AWAITING_PAYMENT", "CANCELLED", "REFUNDED"],
            },
            paymentMethod: {
                in: MANUAL_PAYMENT_METHODS,
            },
        };
    }

    return {
        status: "AWAITING_PAYMENT",
        paymentMethod: {
            in: MANUAL_PAYMENT_METHODS,
        },
    };
}

export function getAdminPaymentLifecycleState(booking, now = new Date()) {
    if (booking.status === "CANCELLED") {
        return "cancelled";
    }

    if (booking.status === "REFUNDED") {
        return "refunded";
    }

    const reminderState = getPaymentReminderState(booking, now);
    if (reminderState.isOverdueForCancellation) {
        return "overdue";
    }

    return "open";
}

export function getAdminPaymentSortDate(booking, now = new Date()) {
    const state = getAdminPaymentLifecycleState(booking, now);
    const reminderState = getPaymentReminderState(booking, now);

    if (state === "cancelled") {
        return new Date(booking.paymentCancelledAt ?? booking.updatedAt ?? booking.createdAt);
    }

    if (state === "refunded") {
        return new Date(booking.paymentCancelledAt ?? booking.updatedAt ?? booking.createdAt);
    }

    if (state === "overdue") {
        return addDays(booking.createdAt, reminderState.autoCancelDays);
    }

    const threshold = reminderState.nextThreshold ?? reminderState.autoCancelDays;
    return addDays(booking.createdAt, threshold);
}

function getSortRank(booking, now = new Date()) {
    switch (getAdminPaymentLifecycleState(booking, now)) {
        case "overdue":
            return 0;
        case "open":
            return 1;
        case "cancelled":
        case "refunded":
        default:
            return 2;
    }
}

export function sortAdminPayments(bookings, now = new Date()) {
    return [...bookings].sort((a, b) => {
        const rankA = getSortRank(a, now);
        const rankB = getSortRank(b, now);

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const dateA = getAdminPaymentSortDate(a, now).getTime();
        const dateB = getAdminPaymentSortDate(b, now).getTime();
        if (dateA !== dateB) {
            return dateA - dateB;
        }

        return String(a.id).localeCompare(String(b.id));
    });
}

export function filterAdminPayments(bookings, { search = "", view = "all", status = "open" } = {}, now = new Date()) {
    const q = normalizeText(search);
    const normalizedView = normalizeAdminPaymentView(view);
    const normalizedStatus = normalizeAdminPaymentStatus(status);

    return sortAdminPayments(
        bookings.filter((booking) => {
            const lifecycleState = getAdminPaymentLifecycleState(booking, now);
            if (normalizedStatus !== "all" && lifecycleState !== normalizedStatus) {
                return false;
            }

            const reminderSummary = getPaymentReminderSummary(booking, now);
            const cancelSummary = getPaymentAutoCancelSummary(booking, now);

            if (normalizedView !== "all") {
                switch (normalizedView) {
                    case "due":
                        if (reminderSummary.kind !== "due") return false;
                        break;
                    case "cancel":
                        if (cancelSummary.kind !== "cancel") return false;
                        break;
                    case "invoice":
                        if (booking.paymentMethod !== "INVOICE") return false;
                        break;
                    case "transfer":
                        if (booking.paymentMethod !== "BANK_TRANSFER") return false;
                        break;
                    case "overdue-invoice":
                        if (lifecycleState !== "overdue" || booking.paymentMethod !== "INVOICE") {
                            return false;
                        }
                        break;
                    case "overdue-transfer":
                        if (
                            lifecycleState !== "overdue" ||
                            booking.paymentMethod !== "BANK_TRANSFER"
                        ) {
                            return false;
                        }
                        break;
                    default:
                        break;
                }
            }

            if (!q) return true;

            const haystack = [
                booking.id,
                booking.event?.title,
                booking.event?.location,
                booking.event?.city,
                booking.purchaserName,
                booking.purchaserEmail,
                booking.paymentMethod,
                booking.paymentReference,
                booking.billingName,
                booking.billingStreet,
                booking.billingStreet2,
                booking.billingPostalCode,
                booking.billingCity,
                lifecycleState,
                reminderSummary.label,
                reminderSummary.value,
                cancelSummary.label,
                cancelSummary.value,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(q);
        }),
        now
    );
}

function escapeCsvValue(value) {
    const stringValue = String(value ?? "");
    return `"${stringValue.replaceAll('"', '""')}"`;
}

function toIsoString(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function buildAdminPaymentsCsv(bookings, now = new Date()) {
    const rows = bookings.map((booking) => {
        const reminderSummary = getPaymentReminderState(booking, now);
        const cancelSummary = getPaymentAutoCancelSummary(booking, now);
        const lifecycleState = getAdminPaymentLifecycleState(booking, now);

        return [
            booking.id,
            lifecycleState,
            booking.status,
            booking.paymentMethod,
            getPaymentMethodLabel(booking.paymentMethod),
            booking.paymentReference ?? "",
            booking.event?.title ?? "",
            booking.event?.location ?? "",
            booking.event?.city ?? "",
            booking.purchaserName ?? "",
            booking.purchaserEmail ?? "",
            booking.billingName ?? "",
            booking.billingStreet ?? "",
            booking.billingStreet2 ?? "",
            booking.billingPostalCode ?? "",
            booking.billingCity ?? "",
            formatMoney(booking.totalAmount ?? 0),
            booking.quantity ?? 0,
            reminderSummary.reminderCount,
            reminderSummary.nextThreshold ?? "",
            reminderSummary.dueDate?.toISOString?.() ?? "",
            cancelSummary.label,
            cancelSummary.value ?? "",
            booking.paymentReminderCount ?? 0,
            toIsoString(booking.lastPaymentReminderAt),
            toIsoString(booking.paymentCancelledAt),
            booking.paymentCancellationReason ?? "",
            toIsoString(booking.paidAt),
            toIsoString(booking.createdAt),
        ];
    });

    const header = [
        "booking_id",
        "lifecycle_state",
        "booking_status",
        "payment_method",
        "payment_method_label",
        "payment_reference",
        "event_title",
        "event_location",
        "event_city",
        "purchaser_name",
        "purchaser_email",
        "billing_name",
        "billing_street",
        "billing_street2",
        "billing_postal_code",
        "billing_city",
        "total_amount",
        "quantity",
        "reminder_count",
        "next_threshold_days",
        "manual_due_date",
        "auto_cancel_label",
        "auto_cancel_value",
        "payment_reminder_count",
        "last_payment_reminder_at",
        "payment_cancelled_at",
        "payment_cancellation_reason",
        "paid_at",
        "created_at",
    ];

    return [
        "\ufeff" + header.map(escapeCsvValue).join(";"),
        ...rows.map((row) => row.map(escapeCsvValue).join(";")),
    ].join("\r\n");
}

export function buildAdminPaymentsHref(basePath, search, status, view, overrides = {}) {
    const params = new URLSearchParams();
    const nextSearch = overrides.search ?? search;
    const nextStatus = overrides.status ?? status;
    const nextView = overrides.view ?? view;

    if (nextSearch) {
        params.set("search", nextSearch);
    }
    if (nextStatus && nextStatus !== "all") {
        params.set("status", nextStatus);
    }
    if (nextView && nextView !== "all") {
        params.set("view", nextView);
    }

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

export function buildAdminPaymentsExportHref(basePath, search, status, view, mode = "visible") {
    if (mode === "status") {
        return buildAdminPaymentsHref(basePath, "", status, "all");
    }

    return buildAdminPaymentsHref(basePath, search, status, view);
}
