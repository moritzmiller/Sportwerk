import crypto from "node:crypto";

import { writeErichAuditLog } from "./audit.js";
import { assertErichPermission, ERICH_PERMISSIONS } from "./permissions.js";

const ACTIVE_TICKET_STATUSES = new Set(["ACTIVE"]);
const ACCEPTED_CHECK_IN_STATUSES = new Set(["ACCEPTED"]);

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

export function createErichTicketId({ prefix = "ERI", bytes = 16 } = {}) {
    const token = crypto.randomBytes(bytes).toString("base64url").toUpperCase();
    return `${prefix}-${token}`;
}

export function buildTicketCreateData({ eventId, raceEntry = null, teamEntry = null, ticketId = createErichTicketId() }) {
    if (!eventId) throw new Error("eventId is required.");
    if (!raceEntry?.id && !teamEntry?.id) {
        throw new Error("raceEntry or teamEntry is required.");
    }

    return {
        eventId,
        ticketId,
        athleteId: raceEntry?.athleteId ?? null,
        raceEntryId: raceEntry?.id ?? null,
        teamEntryId: teamEntry?.id ?? null,
        status: "ACTIVE",
    };
}

export function buildReducedScannerTicket(ticket) {
    if (!ticket?.id) throw new Error("ticket is required.");

    return {
        ticketId: ticket.ticketId,
        status: ticket.status,
        issuedAt: ticket.issuedAt ?? null,
        athlete: ticket.athlete
            ? {
                  id: ticket.athlete.id,
                  firstName: ticket.athlete.firstName,
                  lastName: ticket.athlete.lastName,
                  clubName: ticket.athlete.club?.officialName ?? null,
              }
            : null,
        raceEntry: ticket.raceEntry
            ? {
                  id: ticket.raceEntry.id,
                  raceNumber: ticket.raceEntry.raceNumber,
                  status: ticket.raceEntry.status,
                  classLabel: ticket.raceEntry.raceDefinition?.classLabel ?? null,
                  distanceLabel: ticket.raceEntry.raceDefinition?.distanceLabel ?? null,
                  gender: ticket.raceEntry.raceDefinition?.gender ?? null,
              }
            : null,
        teamEntry: ticket.teamEntry
            ? {
                  id: ticket.teamEntry.id,
                  raceNumber: ticket.teamEntry.raceNumber,
                  teamName: ticket.teamEntry.teamName,
                  status: ticket.teamEntry.status,
              }
            : null,
    };
}

export function decideTicketCheckIn({ ticket, previousCheckIns = [] }) {
    if (!ticket?.id) throw new Error("ticket is required.");

    if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
        return {
            accepted: false,
            status: "REJECTED",
            warning: `ticket-${ticket.status}`,
        };
    }

    const alreadyAccepted = previousCheckIns.some((checkIn) =>
        ACCEPTED_CHECK_IN_STATUSES.has(checkIn.status)
    );
    if (alreadyAccepted) {
        return {
            accepted: false,
            status: "DUPLICATE",
            warning: "already-checked-in",
        };
    }

    return {
        accepted: true,
        status: "ACCEPTED",
        warning: null,
    };
}

export function buildCheckInCreateData({
    ticket,
    decision,
    source = "ONLINE",
    scannerId = null,
    deviceId = null,
    offlineId = null,
    now = new Date(),
}) {
    if (!ticket?.id) throw new Error("ticket is required.");
    if (!decision?.status) throw new Error("check-in decision is required.");

    return {
        ticketId: ticket.id,
        source,
        status: decision.status,
        warning: decision.warning,
        scannedAt: now,
        scannerId,
        deviceId,
        offlineId,
        syncStatus: offlineId ? "SYNCED" : null,
        details: {
            accepted: decision.accepted,
            reducedTicket: buildReducedScannerTicket(ticket),
        },
    };
}

export function buildDocumentIssueData({ ticketId, issuedById = null, source = "SYSTEM", now = new Date() }) {
    if (!ticketId) throw new Error("ticketId is required.");

    return {
        ticketId,
        status: "ISSUED",
        issuedAt: now,
        issuedById,
        source,
    };
}

export function buildExportJobCreateData({
    eventId,
    exportType,
    version,
    requestedById,
    rowCount,
    filters = {},
}) {
    if (!eventId) throw new Error("eventId is required.");
    if (!exportType) throw new Error("exportType is required.");
    if (!Number.isInteger(version) || version <= 0) throw new Error("version must be a positive integer.");
    if (!Number.isInteger(rowCount) || rowCount < 0) throw new Error("rowCount must be a non-negative integer.");

    return {
        eventId,
        exportType,
        version,
        status: "PREPARED",
        requestedById,
        rowCount,
        filters,
    };
}

export async function scanErichTicket(store, {
    user,
    ticketId,
    source = "ONLINE",
    deviceId = null,
    offlineId = null,
    now = new Date(),
}) {
    if (!ticketId) throw new Error("ticketId is required.");

    const ticket = await store.erichTicket.findUnique({
        where: { ticketId },
        include: {
            event: { select: { id: true } },
            athlete: { include: { club: true } },
            raceEntry: { include: { raceDefinition: true } },
            teamEntry: true,
            checkIns: {
                orderBy: { scannedAt: "desc" },
                take: 10,
            },
        },
    });

    if (!ticket) {
        throw structuredError({
            code: "ERICH_TICKET_NOT_FOUND",
            message: "ERICH ticket was not found.",
        });
    }

    assertErichPermission(user, ERICH_PERMISSIONS.SCAN_TICKETS, ticket.eventId);

    const decision = decideTicketCheckIn({ ticket, previousCheckIns: ticket.checkIns });
    const checkIn = await store.erichCheckIn.create({
        data: buildCheckInCreateData({
            ticket,
            decision,
            source,
            scannerId: user?.id ?? null,
            deviceId,
            offlineId,
            now,
        }),
    });

    await writeErichAuditLog({
        store,
        eventId: ticket.eventId,
        actorId: user?.id ?? null,
        entityType: "ErichTicket",
        entityId: ticket.id,
        action: "ticket.scanned",
        reason: "ERICH ticket check-in scan",
        oldValue: null,
        newValue: {
            ticketId: ticket.ticketId,
            checkInStatus: checkIn.status,
            warning: checkIn.warning,
        },
    });

    return {
        checkIn,
        decision,
        ticket: buildReducedScannerTicket(ticket),
    };
}

