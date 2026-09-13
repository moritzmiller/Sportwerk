const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_SECTIONS = 80;
const MAX_ROWS_PER_SECTION = 400;
const MAX_SEATS_PER_ROW = 400;
const MAX_TOTAL_SEATS = 50000;
const SECTION_TYPES = new Set(["BLOCK", "STANDING", "VIP", "ACCESSIBLE"]);
const SEAT_STATUSES = new Set(["AVAILABLE", "BLOCKED", "ACCESSIBLE", "HOLD"]);

function normalizeText(value, { maxLength = 500 } = {}) {
    return String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, maxLength);
}

function normalizeIdentifier(value, fallback) {
    const normalized = normalizeText(value, { maxLength: 80 }).replace(/[^a-zA-Z0-9_-]/g, "");
    return normalized || fallback;
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizeSeat(rawSeat, index, rowId) {
    const label = normalizeText(rawSeat?.label, { maxLength: 40 }) || String(index + 1);
    const status = SEAT_STATUSES.has(rawSeat?.status) ? rawSeat.status : "AVAILABLE";

    return {
        id: normalizeIdentifier(rawSeat?.id, `${rowId}-${index + 1}`),
        label,
        status,
        x: Math.max(0, normalizeNumber(rawSeat?.x, index)),
        y: Math.max(0, normalizeNumber(rawSeat?.y, 0)),
        ...(rawSeat?.ticketTypeId ? { ticketTypeId: normalizeText(rawSeat.ticketTypeId, { maxLength: 120 }) } : {}),
    };
}

function normalizeRow(rawRow, index, sectionId) {
    const label = normalizeText(rawRow?.label, { maxLength: 40 }) || String(index + 1);
    const rowId = normalizeIdentifier(rawRow?.id, `${sectionId}-row-${index + 1}`);
    const seats = Array.isArray(rawRow?.seats)
        ? rawRow.seats.slice(0, MAX_SEATS_PER_ROW).map((seat, seatIndex) => normalizeSeat(seat, seatIndex, rowId))
        : [];

    return {
        id: rowId,
        label,
        seats,
    };
}

function normalizeSection(rawSection, index) {
    const name = normalizeText(rawSection?.name, { maxLength: 80 }) || `Block ${index + 1}`;
    const sectionId = normalizeIdentifier(rawSection?.id, `section-${index + 1}`);
    const type = SECTION_TYPES.has(rawSection?.type) ? rawSection.type : "BLOCK";
    const rows = Array.isArray(rawSection?.rows)
        ? rawSection.rows.slice(0, MAX_ROWS_PER_SECTION).map((row, rowIndex) => normalizeRow(row, rowIndex, sectionId))
        : [];

    return {
        id: sectionId,
        name,
        type,
        color: normalizeText(rawSection?.color, { maxLength: 20 }) || "#2563eb",
        rows,
    };
}

export function summarizeSeatingLayout(layout = {}) {
    const sections = Array.isArray(layout.sections) ? layout.sections : [];
    let rowCount = 0;
    let seatCount = 0;
    const byStatus = {};

    for (const section of sections) {
        const rows = Array.isArray(section.rows) ? section.rows : [];
        rowCount += rows.length;
        for (const row of rows) {
            const seats = Array.isArray(row.seats) ? row.seats : [];
            seatCount += seats.length;
            for (const seat of seats) {
                const status = SEAT_STATUSES.has(seat.status) ? seat.status : "AVAILABLE";
                byStatus[status] = (byStatus[status] || 0) + 1;
            }
        }
    }

    return {
        sections: sections.length,
        rows: rowCount,
        seats: seatCount,
        byStatus,
    };
}

export function normalizeSeatingLayout(rawLayout = {}) {
    const source = rawLayout && typeof rawLayout === "object" && !Array.isArray(rawLayout) ? rawLayout : {};
    const sections = Array.isArray(source.sections)
        ? source.sections.slice(0, MAX_SECTIONS).map((section, index) => normalizeSection(section, index))
        : [];
    const layout = {
        version: 1,
        venueType: normalizeText(source.venueType, { maxLength: 40 }) || "STADIUM",
        sections,
    };
    const summary = summarizeSeatingLayout(layout);
    const errors = [];

    if (sections.length === 0) {
        errors.push("Mindestens ein Block ist erforderlich.");
    }
    if (summary.seats === 0) {
        errors.push("Mindestens ein Sitzplatz ist erforderlich.");
    }
    if (summary.seats > MAX_TOTAL_SEATS) {
        errors.push(`Maximal ${MAX_TOTAL_SEATS} Sitzplaetze pro Sitzplan sind erlaubt.`);
    }

    return {
        layout: {
            ...layout,
            summary,
        },
        summary,
        errors,
    };
}

export function normalizeSeatingPlanPayload(body = {}) {
    const normalizedLayout = normalizeSeatingLayout(body.layout);

    return {
        data: {
            name: normalizeText(body.name, { maxLength: MAX_NAME_LENGTH }),
            description: normalizeText(body.description, { maxLength: MAX_DESCRIPTION_LENGTH }) || null,
            layout: normalizedLayout.layout,
            seatCount: normalizedLayout.summary.seats,
        },
        errors: [
            ...(!normalizeText(body.name, { maxLength: MAX_NAME_LENGTH }) ? ["Ein Name fuer den Sitzplan ist erforderlich."] : []),
            ...normalizedLayout.errors,
        ],
    };
}

export function buildSimpleBlockLayout({
    sectionName = "Block A",
    rowPrefix = "",
    rowCount = 10,
    seatsPerRow = 20,
} = {}) {
    const safeRowCount = Math.max(1, Math.min(MAX_ROWS_PER_SECTION, Math.floor(Number(rowCount) || 1)));
    const safeSeatsPerRow = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.floor(Number(seatsPerRow) || 1)));
    const safeSectionName = normalizeText(sectionName, { maxLength: 80 }) || "Block A";
    const sectionId = normalizeIdentifier(safeSectionName.toLowerCase(), "section-1");
    const prefix = normalizeText(rowPrefix, { maxLength: 8 });

    return normalizeSeatingLayout({
        venueType: "STADIUM",
        sections: [
            {
                id: sectionId,
                name: safeSectionName,
                type: "BLOCK",
                color: "#2563eb",
                rows: Array.from({ length: safeRowCount }, (_, rowIndex) => {
                    const rowLabel = `${prefix}${rowIndex + 1}`;
                    const rowId = `${sectionId}-row-${rowIndex + 1}`;
                    return {
                        id: rowId,
                        label: rowLabel,
                        seats: Array.from({ length: safeSeatsPerRow }, (_, seatIndex) => ({
                            id: `${rowId}-seat-${seatIndex + 1}`,
                            label: String(seatIndex + 1),
                            status: "AVAILABLE",
                            x: seatIndex,
                            y: rowIndex,
                        })),
                    };
                }),
            },
        ],
    }).layout;
}
