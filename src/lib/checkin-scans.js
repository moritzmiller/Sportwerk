function toText(value) {
    return String(value ?? "").trim();
}

function toIso(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function getScanStatusLabel(status) {
    switch (status) {
        case "SCANNED":
            return "Eingecheckt";
        case "ALREADY_SCANNED":
            return "Bereits gescannt";
        case "REJECTED":
            return "Abgewiesen";
        case "INVALID":
            return "Ungültig";
        case "NOT_FOUND":
            return "Nicht gefunden";
        case "FORBIDDEN":
            return "Keine Berechtigung";
        default:
            return status || "Unbekannt";
    }
}

export function getScanTone(status) {
    switch (status) {
        case "SCANNED":
            return "booking-status--paid";
        case "ALREADY_SCANNED":
        case "REJECTED":
            return "booking-status--pending";
        case "INVALID":
        case "NOT_FOUND":
        case "FORBIDDEN":
            return "booking-status--failed";
        default:
            return "booking-status--pending";
    }
}

export function classifyScanWarning(scan, stats = {}) {
    if (scan.warning) {
        return scan.warning;
    }

    if (scan.status === "ALREADY_SCANNED") {
        return "Dieses Ticket wurde bereits eingecheckt.";
    }

    if (scan.status === "REJECTED") {
        return "Dieser Scan wurde abgewiesen.";
    }

    if (Number(stats.duplicateCount || 0) > 0) {
        return `Auffällig: ${stats.duplicateCount} weitere Scanversuche für diese Buchung.`;
    }

    if (Number(stats.recentAttempts || 0) >= 3) {
        return `Auffällig: ${stats.recentAttempts} Scanversuche in kurzer Zeit.`;
    }

    return null;
}

export function buildCheckinScanStats(scans = []) {
    const uniqueTicketKeys = new Set(
        scans
            .map((scan) => scan.ticketId ? `ticket:${scan.ticketId}` : scan.bookingId ? `booking:${scan.bookingId}` : null)
            .filter(Boolean)
    );

    const stats = {
        totalAttempts: scans.length,
        successfulScans: scans.filter((scan) => scan.status === "SCANNED").length,
        duplicateScans: scans.filter((scan) => scan.status === "ALREADY_SCANNED").length,
        rejectedScans: scans.filter((scan) => scan.status === "REJECTED").length,
        invalidScans: scans.filter((scan) => scan.status === "INVALID" || scan.status === "NOT_FOUND").length,
        uniqueTickets: uniqueTicketKeys.size,
        uniqueBookings: new Set(
            scans.filter((scan) => scan.bookingId).map((scan) => scan.bookingId)
        ).size,
    };

    return stats;
}

export function getScanTicketLabel(scan) {
    const holderName = toText(scan.ticket?.holderName);
    if (holderName) return holderName;

    const purchaserName = toText(scan.booking?.purchaserName);
    if (purchaserName) return purchaserName;

    if (scan.ticketId) return scan.ticketId;
    if (scan.bookingId) return scan.bookingId;

    return "Unbekannt";
}

export function buildCheckinScansCsv(scans = []) {
    const header = [
        "created_at",
        "status",
        "warning",
        "ticket_id",
        "ticket_holder_name",
        "ticket_type",
        "booking_id",
        "event_id",
        "event_title",
        "purchaser_name",
        "purchaser_email",
        "quantity",
        "source",
        "scanner_name",
        "scanner_email",
        "raw_input",
        "details",
    ];

    const rows = scans.map((scan) => [
        toIso(scan.createdAt),
        scan.status,
        scan.warning ?? "",
        scan.ticketId ?? "",
        scan.ticket?.holderName ?? "",
        scan.ticket?.ticketTypeName ?? "",
        scan.bookingId ?? "",
        scan.eventId ?? "",
        scan.event?.title ?? "",
        scan.booking?.purchaserName ?? "",
        scan.booking?.purchaserEmail ?? "",
        scan.booking?.quantity ?? "",
        scan.source ?? "",
        scan.scannerName ?? "",
        scan.scannerEmail ?? "",
        scan.rawInput ?? "",
        scan.details ? JSON.stringify(scan.details) : "",
    ]);

    return [
        "\ufeff" + header.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"),
        ...rows.map((row) =>
            row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")
        ),
    ].join("\r\n");
}

export function summarizeRecentWarnings(scans = []) {
    return scans
        .filter((scan) => Boolean(scan.warning))
        .slice(0, 5)
        .map((scan) => ({
            id: scan.id,
            status: scan.status,
            warning: scan.warning,
            createdAt: scan.createdAt,
            bookingId: scan.bookingId,
            ticketId: scan.ticketId,
            ticketLabel: getScanTicketLabel(scan),
        }));
}
