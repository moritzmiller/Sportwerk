import { randomBytes } from "crypto";

import { getCurrentUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildScannerPath, createScannerToken, hashScannerToken } from "@/lib/scanner-links";
import { getAppUrl } from "@/lib/env";

const SCANNER_LINK_TTL_HOURS = 24;

function getBaseUrl(request) {
    return getAppUrl(request);
}

async function getManageableEvent(params) {
    const user = await getCurrentUser();
    if (!user) {
        return { error: Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 }) };
    }

    const resolvedParams = await params;
    const eventId = Number(resolvedParams.id);
    if (!Number.isInteger(eventId)) {
        return { error: Response.json({ error: "Ungültige Event-ID." }, { status: 400 }) };
    }

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            organization: { include: { members: true } },
            members: true,
        },
    });

    if (!event) {
        return { error: Response.json({ error: "Event nicht gefunden." }, { status: 404 }) };
    }

    if (!canManageEvent(user, event)) {
        return { error: Response.json({ error: "Keine Berechtigung." }, { status: 403 }) };
    }

    return { user, event };
}

function serializeScannerLink(link) {
    const now = new Date();
    const revoked = Boolean(link.revokedAt);
    const expired = link.expiresAt <= now;

    return {
        id: link.id,
        createdAt: link.createdAt.toISOString(),
        expiresAt: link.expiresAt.toISOString(),
        revokedAt: link.revokedAt?.toISOString() ?? null,
        lastUsedAt: link.lastUsedAt?.toISOString() ?? null,
        lastUsedIp: link.lastUsedIp,
        lastUserAgent: link.lastUserAgent,
        createdBy: link.createdBy
            ? {
                  id: link.createdBy.id,
                  name: link.createdBy.name,
                  email: link.createdBy.email,
              }
            : null,
        status: revoked ? "revoked" : expired ? "expired" : "active",
    };
}

export async function GET(_request, { params }) {
    const access = await getManageableEvent(params);
    if (access.error) return access.error;

    const links = await prisma.eventScannerLink.findMany({
        where: { eventId: access.event.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
            createdBy: {
                select: { id: true, name: true, email: true },
            },
        },
    });

    return Response.json({
        ok: true,
        eventId: access.event.id,
        links: links.map(serializeScannerLink),
    });
}

export async function POST(request, { params }) {
    const access = await getManageableEvent(params);
    if (access.error) return access.error;

    const { user, event } = access;
    const scannerLinkId = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + SCANNER_LINK_TTL_HOURS * 60 * 60 * 1000);
    const token = createScannerToken({
        eventId: event.id,
        scannerLinkId,
        expiresAt,
    });
    await prisma.eventScannerLink.create({
        data: {
            id: scannerLinkId,
            eventId: event.id,
            tokenHash: hashScannerToken(token),
            createdById: user.id,
            expiresAt,
        },
    });

    const path = buildScannerPath(event.id, token);
    const url = new URL(path, getBaseUrl(request)).toString();

    return Response.json({
        ok: true,
        eventId: event.id,
        path,
        url,
        expiresAt: expiresAt.toISOString(),
    });
}

export async function DELETE(request, { params }) {
    const access = await getManageableEvent(params);
    if (access.error) return access.error;

    const body = await request.json().catch(() => ({}));
    const scannerLinkId = String(body.id ?? "").trim();

    if (!scannerLinkId) {
        return Response.json({ error: "Scanner-Link-ID fehlt." }, { status: 400 });
    }

    const result = await prisma.eventScannerLink.updateMany({
        where: {
            id: scannerLinkId,
            eventId: access.event.id,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });

    if (result.count !== 1) {
        return Response.json(
            { error: "Scanner-Link wurde nicht gefunden oder ist bereits widerrufen." },
            { status: 404 }
        );
    }

    return Response.json({ ok: true, id: scannerLinkId });
}
