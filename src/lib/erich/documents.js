import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { sendTransactionalMail } from "../mail.js";
import { normalizeSafeText } from "../security.js";
import { writeErichAuditLog } from "./audit.js";
import { buildDocumentIssueData, buildTicketCreateData } from "./fulfillment.js";
import { canManageOwnErichRecord } from "./permissions.js";

const DOCUMENT_TEMPLATE_KEY = "erich.athlete-ticket-document";
const GUEST_EMAIL_SUFFIX = "@guest.gatekeeper.local";
const ACTIVE_ENTRY_STATUS = "ACTIVE";

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function isGuestEmail(email) {
    return String(email ?? "").toLowerCase().endsWith(GUEST_EMAIL_SUFFIX);
}

function athleteName(athlete) {
    return [athlete?.firstName, athlete?.lastName].filter(Boolean).join(" ").trim() || "Athlet";
}

function raceLabel(entry) {
    return [
        `Rennen ${entry.raceNumber}`,
        entry.raceDefinition?.classLabel,
        entry.raceDefinition?.distanceLabel,
        entry.raceDefinition?.gender,
    ].filter(Boolean).join(" · ");
}

function formatDate(value, timeZone = "Europe/Berlin") {
    if (!value) return "Noch nicht festgelegt";
    return new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
    }).format(new Date(value));
}

function formatTargetTime(entry) {
    const minutes = String(entry.targetTimeMinutes ?? 0);
    const seconds = String(entry.targetTimeSeconds ?? 0).padStart(2, "0");
    const milliseconds = String(entry.targetTimeMilliseconds ?? 0).padStart(3, "0");
    return `${minutes}:${seconds},${milliseconds}`;
}

function documentUrl({ origin, batchId, athleteId }) {
    if (!origin) return null;
    const url = new URL(`/api/erich/registration-batches/${batchId}/athletes/${athleteId}/ticket.pdf`, origin);
    return url.toString();
}

function resolveReporterEmail(batch, athlete = null) {
    const billingEmail = batch.billingProfiles?.[0]?.invoiceEmail ?? null;
    if (billingEmail) return billingEmail;
    if (batch.account?.email && !isGuestEmail(batch.account.email)) return batch.account.email;
    return athlete?.email ?? null;
}

function groupActiveEntriesByAthlete(entries = []) {
    const grouped = new Map();

    for (const entry of entries) {
        if (entry.status !== ACTIVE_ENTRY_STATUS) continue;
        if (!grouped.has(entry.athleteId)) {
            grouped.set(entry.athleteId, {
                athlete: entry.athlete,
                raceEntries: [],
            });
        }
        grouped.get(entry.athleteId).raceEntries.push(entry);
    }

    return [...grouped.values()];
}

function accessWhere(user, batchId) {
    return {
        id: batchId,
        ...(user?.id && user.role !== "ADMIN"
            ? {
                  OR: [
                      { accountId: user.id },
                      {
                          event: {
                              roleAssignments: {
                                  some: {
                                      userId: user.id,
                                      role: { in: ["ADMIN", "REGISTRATION_OFFICE"] },
                                  },
                              },
                          },
                      },
                  ],
              }
            : {}),
    };
}

function erichTicketDocumentInclude() {
    return {
        account: { select: { id: true, email: true, name: true } },
        event: { select: { id: true, name: true, slug: true, startsAt: true, timezone: true } },
        billingProfiles: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { invoiceEmail: true, firstName: true, lastName: true, company: true },
        },
        raceEntries: {
            where: { status: ACTIVE_ENTRY_STATUS },
            include: {
                athlete: {
                    include: {
                        club: { select: { officialName: true, shortName: true } },
                    },
                },
                raceDefinition: {
                    select: {
                        raceNumber: true,
                        classLabel: true,
                        distanceLabel: true,
                        gender: true,
                    },
                },
                tickets: {
                    where: { status: "ACTIVE" },
                    orderBy: { createdAt: "asc" },
                    take: 1,
                },
            },
            orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
        },
    };
}

export async function loadErichAthleteTicketDocument(store, { user, batchId, athleteId }) {
    if (!user?.id) throw new Error("user is required.");
    if (!batchId) throw new Error("batchId is required.");
    if (!athleteId) throw new Error("athleteId is required.");

    const batch = await store.erichRegistrationBatch.findFirst({
        where: accessWhere(user, batchId),
        include: erichTicketDocumentInclude(),
    });

    if (!batch || !canManageOwnErichRecord(user, batch)) {
        throw structuredError({
            code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
            message: "ERICH registration batch was not found.",
        });
    }

    if (batch.status !== "PAID") {
        throw structuredError({
            code: "ERICH_TICKET_DOCUMENT_NOT_READY",
            message: "ERICH tickets are only available after successful payment.",
            details: { status: batch.status },
        });
    }

    const raceEntries = batch.raceEntries.filter((entry) => entry.athleteId === athleteId);
    if (raceEntries.length === 0) {
        throw structuredError({
            code: "ERICH_ATHLETE_DOCUMENT_NOT_FOUND",
            message: "ERICH athlete ticket document was not found.",
        });
    }

    return {
        batch: {
            id: batch.id,
            eventId: batch.eventId,
            status: batch.status,
            paidAt: batch.paidAt,
            account: batch.account,
        },
        event: batch.event,
        athlete: raceEntries[0].athlete,
        raceEntries,
    };
}

function collectPdfBuffer(doc) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.end();
    });
}

export async function generateErichAthleteTicketPdf(documentData) {
    const qrCodes = await Promise.all(
        documentData.raceEntries.map(async (entry) => ({
            raceEntryId: entry.id,
            dataUrl: await QRCode.toDataURL(entry.tickets?.[0]?.ticketId ?? entry.id, {
                margin: 1,
                width: 180,
            }),
        }))
    );
    const qrCodeByEntryId = new Map(qrCodes.map((qrCode) => [qrCode.raceEntryId, qrCode.dataUrl]));

    const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: "ERICH Ticket" } });
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const event = documentData.event;
    const athlete = documentData.athlete;
    const clubName = athlete.club?.officialName ?? athlete.club?.shortName ?? "Kein Verein";

    doc.rect(0, 0, doc.page.width, 96).fill("#17324d");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(event.name, 44, 30, { width: pageWidth });
    doc.font("Helvetica").fontSize(10).text(`Start: ${formatDate(event.startsAt, event.timezone)}`, 44, 62);

    doc.fillColor("#17324d").font("Helvetica-Bold").fontSize(18).text("Rennübersicht und Check-in-Tickets", 44, 124);
    doc.fillColor("#1f2937").font("Helvetica").fontSize(11).text(`Athlet: ${athleteName(athlete)}`, 44, 154);
    doc.text(`Verein: ${clubName}`, 44, 171);
    doc.text(`Geburtsjahr: ${athlete.birthYear}`, 44, 188);

    let y = 224;
    for (const entry of documentData.raceEntries) {
        if (y > 650) {
            doc.addPage();
            y = 54;
        }

        doc.roundedRect(44, y, pageWidth, 146, 8).stroke("#d7dee8");
        doc.fillColor("#17324d").font("Helvetica-Bold").fontSize(13).text(raceLabel(entry), 62, y + 18, {
            width: pageWidth - 190,
        });
        doc.fillColor("#475569").font("Helvetica").fontSize(10).text(`Zielzeit: ${formatTargetTime(entry)}`, 62, y + 44);
        doc.text(`Ticket-Code: ${entry.tickets?.[0]?.ticketId ?? "Noch nicht ausgestellt"}`, 62, y + 64, {
            width: pageWidth - 190,
        });

        const qrCode = qrCodeByEntryId.get(entry.id);
        if (qrCode) {
            doc.image(qrCode, doc.page.width - 174, y + 18, { width: 96, height: 96 });
            doc.fillColor("#64748b").fontSize(8).text("QR-Code beim Check-in vorzeigen", doc.page.width - 192, y + 120, {
                width: 132,
                align: "center",
            });
        }

        y += 166;
    }

    doc.fillColor("#64748b").font("Helvetica").fontSize(8).text(
        "Dieses Dokument gilt nur für die aufgeführten ERICH-Rennen. Der QR-Code wird beim Check-in gescannt.",
        44,
        doc.page.height - 62,
        { width: pageWidth, align: "center" }
    );

    return collectPdfBuffer(doc);
}

export function buildErichAthleteTicketFilename({ event, athlete }) {
    const slug = normalizeSafeText(event?.slug ?? event?.name ?? "erich", { maxLength: 80 })
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "erich";
    const name = normalizeSafeText(athleteName(athlete), { maxLength: 80 })
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "athlet";

    return `${slug}-${name}-ticket.pdf`;
}

async function createOrReuseTicketForRaceEntry(store, { eventId, raceEntry, now }) {
    const existing = await store.erichTicket.findFirst({
        where: {
            raceEntryId: raceEntry.id,
            status: "ACTIVE",
        },
        include: { documentIssues: true },
    });

    const ticket =
        existing ??
        (await store.erichTicket.create({
            data: {
                ...buildTicketCreateData({ eventId, raceEntry }),
                issuedAt: now,
            },
            include: { documentIssues: true },
        }));

    await store.erichDocumentIssue.upsert({
        where: {
            ticketId_status: {
                ticketId: ticket.id,
                status: "ISSUED",
            },
        },
        create: buildDocumentIssueData({
            ticketId: ticket.id,
            source: "CHECKOUT",
            now,
        }),
        update: {},
    });

    return ticket;
}

async function createOrReuseDocumentEmail(store, { batch, athlete, entries, recipientEmail, origin }) {
    const existingMessages = await store.erichEmailMessage.findMany({
        where: {
            registrationBatchId: batch.id,
            templateKey: DOCUMENT_TEMPLATE_KEY,
        },
        select: {
            id: true,
            status: true,
            payload: true,
        },
    });

    const existing = existingMessages.find((message) => message.payload?.athleteId === athlete.id);
    if (existing?.status === "SENT" || existing?.status === "PREPARED") return existing;

    const payload = {
        athleteId: athlete.id,
        raceEntryIds: entries.map((entry) => entry.id),
        ticketIds: entries.map((entry) => entry.tickets?.[0]?.ticketId).filter(Boolean),
        documentUrl: documentUrl({ origin, batchId: batch.id, athleteId: athlete.id }),
    };

    if (existing) {
        return store.erichEmailMessage.update({
            where: { id: existing.id },
            data: {
                status: "PREPARED",
                errorMessage: null,
                recipientEmail,
                payload,
            },
        });
    }

    return store.erichEmailMessage.create({
        data: {
            accountId: batch.accountId,
            registrationBatchId: batch.id,
            templateKey: DOCUMENT_TEMPLATE_KEY,
            language: "de",
            recipientEmail,
            subject: `Deine ERICH Tickets für ${athleteName(athlete)}`,
            status: "PREPARED",
            payload,
        },
    });
}

export async function preparePaidErichRegistrationDocuments(store, {
    batchId,
    actorId = null,
    now = new Date(),
    origin = null,
} = {}) {
    if (!batchId) throw new Error("batchId is required.");

    const batch = await store.erichRegistrationBatch.findUnique({
        where: { id: batchId },
        include: erichTicketDocumentInclude(),
    });

    if (!batch) {
        throw structuredError({
            code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
            message: "ERICH registration batch was not found.",
        });
    }

    if (batch.status !== "PAID") {
        return { action: "skipped", reason: "batch-not-paid", batchId, documents: [] };
    }

    const preparedDocuments = [];
    for (const group of groupActiveEntriesByAthlete(batch.raceEntries)) {
        const entriesWithTickets = [];
        for (const entry of group.raceEntries) {
            const ticket = await createOrReuseTicketForRaceEntry(store, {
                eventId: batch.eventId,
                raceEntry: entry,
                now,
            });
            entriesWithTickets.push({
                ...entry,
                tickets: [ticket],
            });
        }

        const recipientEmail = resolveReporterEmail(batch, group.athlete);
        const emailMessage = recipientEmail
            ? await createOrReuseDocumentEmail(store, {
                  batch,
                  athlete: group.athlete,
                  entries: entriesWithTickets,
                  recipientEmail,
                  origin,
              })
            : null;

        preparedDocuments.push({
            athleteId: group.athlete.id,
            raceEntryCount: entriesWithTickets.length,
            ticketIds: entriesWithTickets.flatMap((entry) => entry.tickets.map((ticket) => ticket.ticketId)),
            emailMessageId: emailMessage?.id ?? null,
            recipientEmail,
        });
    }

    await writeErichAuditLog({
        store,
        eventId: batch.eventId,
        actorId,
        entityType: "ErichRegistrationBatch",
        entityId: batch.id,
        action: "registration_batch.documents_prepared",
        reason: "ERICH athlete ticket documents prepared",
        oldValue: null,
        newValue: {
            athleteCount: preparedDocuments.length,
            ticketCount: preparedDocuments.reduce((sum, document) => sum + document.ticketIds.length, 0),
        },
    });

    return {
        action: "prepared",
        batchId,
        documents: preparedDocuments,
    };
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function sendErichAthleteTicketDocument(store, { emailMessage, user, batchId }) {
    const athleteId = emailMessage.payload?.athleteId;
    const documentData = await loadErichAthleteTicketDocument(store, {
        user,
        batchId,
        athleteId,
    });
    const pdf = await generateErichAthleteTicketPdf(documentData);
    const filename = buildErichAthleteTicketFilename(documentData);
    const name = athleteName(documentData.athlete);

    await sendTransactionalMail({
        fromLabel: "ERICH Tickets",
        to: emailMessage.recipientEmail,
        subject: emailMessage.subject,
        html: `
            <div style="font-family: Arial, Helvetica, sans-serif; color:#172033; max-width:640px; margin:0 auto; padding:24px;">
                <h1 style="font-size:24px; margin:0 0 14px; color:#17324d;">Deine ERICH Tickets</h1>
                <p style="font-size:15px; line-height:1.6;">Hallo,</p>
                <p style="font-size:15px; line-height:1.6;">im Anhang findest du die Rennübersicht und die Check-in-Tickets für <strong>${escapeHtml(name)}</strong>.</p>
                <p style="font-size:15px; line-height:1.6;">Bitte bringe das PDF digital oder ausgedruckt zum Check-in mit.</p>
                <p style="font-size:13px; line-height:1.5; color:#64748b;">Buchung: ${escapeHtml(batchId)}</p>
            </div>
        `,
        attachments: [
            {
                filename,
                content: pdf,
                contentType: "application/pdf",
            },
        ],
    });
}

export async function sendPreparedErichRegistrationDocuments(store, { batchId, origin = null } = {}) {
    if (!batchId) throw new Error("batchId is required.");

    const batch = await store.erichRegistrationBatch.findUnique({
        where: { id: batchId },
        include: {
            account: { select: { id: true, email: true, name: true, role: true } },
        },
    });
    if (!batch) return { action: "skipped", reason: "batch-not-found", sent: 0, failed: 0 };

    const messages = await store.erichEmailMessage.findMany({
        where: {
            registrationBatchId: batchId,
            templateKey: DOCUMENT_TEMPLATE_KEY,
            status: "PREPARED",
        },
        orderBy: { createdAt: "asc" },
    });

    let sent = 0;
    let failed = 0;
    const user = {
        id: batch.account.id,
        role: batch.account.role,
        erichRoleAssignments: [],
    };

    for (const message of messages) {
        try {
            await sendErichAthleteTicketDocument(store, {
                emailMessage: {
                    ...message,
                    payload: {
                        ...(message.payload ?? {}),
                        documentUrl: message.payload?.documentUrl ?? documentUrl({
                            origin,
                            batchId,
                            athleteId: message.payload?.athleteId,
                        }),
                    },
                },
                user,
                batchId,
            });
            await store.erichEmailMessage.update({
                where: { id: message.id },
                data: {
                    status: "SENT",
                    sentAt: new Date(),
                    errorMessage: null,
                },
            });
            sent += 1;
        } catch (error) {
            await store.erichEmailMessage.update({
                where: { id: message.id },
                data: {
                    status: "FAILED",
                    errorMessage: error?.message?.slice(0, 500) ?? "ERICH ticket email failed.",
                },
            });
            failed += 1;
            console.error("[ERICH] Ticket document email failed:", error);
        }
    }

    return {
        action: "sent",
        sent,
        failed,
    };
}

export async function fulfillPaidErichRegistrationBatch(store, {
    batchId,
    actorId = null,
    now = new Date(),
    origin = null,
} = {}) {
    const prepared = await store.$transaction((tx) =>
        preparePaidErichRegistrationDocuments(tx, { batchId, actorId, now, origin })
    );

    if (prepared.action !== "prepared") return { prepared, delivery: null };

    const delivery = await sendPreparedErichRegistrationDocuments(store, { batchId, origin });
    return { prepared, delivery };
}
