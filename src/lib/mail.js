import nodemailer from "nodemailer";
import QRCode from "qrcode";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { createTicketCode } from "./tickets.js";
import { getAppUrl, getMailConfig } from "./env.js";
import { logSystemEvent } from "./system-events.js";

class MailDeliveryError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "MailDeliveryError";
        this.code = details.code || "MAIL_DELIVERY_FAILED";
        this.provider = details.provider || null;
        this.details = details.details || null;
        this.cause = details.cause;
    }
}

function getConfiguredMailProviders() {
    const providers = [];
    const mailConfig = getMailConfig();
    const preferred = mailConfig.provider;
    const hasResend = mailConfig.hasResend;
    const hasSmtp = mailConfig.hasSmtp;

    if ((preferred === "resend" || preferred === "auto") && hasResend) {
        providers.push("resend");
    }

    if ((preferred === "smtp" || preferred === "auto") && hasSmtp) {
        providers.push("smtp");
    }

    return providers;
}

function getSmtpTransporter() {
    const port = getMailConfig().smtpPort;
    return nodemailer.createTransport({
        host: process.env.EMAIL_SERVER_HOST,
        port,
        secure: process.env.EMAIL_SERVER_SECURE === "true" || port === 465,
        auth: {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    });
}

function buildFrom(label = "Gatekeeper") {
    const from = process.env.EMAIL_FROM;
    if (!from) {
        throw new MailDeliveryError("EMAIL_FROM is missing.", {
            code: "MAIL_FROM_MISSING",
        });
    }
    return `"${label}" <${from}>`;
}

async function sendViaResend(message) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            reply_to: message.replyTo,
            attachments: message.attachments?.map((attachment) => ({
                filename: attachment.filename,
                content:
                    typeof attachment.content === "string"
                        ? attachment.content
                        : attachment.content.toString("base64"),
            })),
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new MailDeliveryError("Resend delivery failed.", {
            code: "RESEND_DELIVERY_FAILED",
            provider: "resend",
            details: body.slice(0, 500),
        });
    }
}

export async function sendTransactionalMail({ fromLabel = "Gatekeeper", ...message }) {
    const providers = getConfiguredMailProviders();

    if (providers.length === 0) {
        throw new MailDeliveryError(
            "No mail provider configured. Set RESEND_API_KEY + EMAIL_FROM or EMAIL_SERVER_HOST/USER/PASSWORD + EMAIL_FROM.",
            { code: "MAIL_NOT_CONFIGURED" }
        );
    }

    const normalizedMessage = {
        ...message,
        from: buildFrom(fromLabel),
    };
    const failures = [];

    for (const provider of providers) {
        try {
            if (provider === "resend") {
                await sendViaResend(normalizedMessage);
            } else {
                await getSmtpTransporter().sendMail(normalizedMessage);
            }
            return { ok: true, provider };
        } catch (error) {
            failures.push({
                provider,
                message: error?.message || String(error),
                details: error?.details,
            });
            console.error(`[Mail-Service] ${provider} delivery failed:`, error);
        }
    }

    await logSystemEvent({
        level: "error",
        area: "mail",
        message: "All configured mail providers failed.",
        details: { failures },
    });

    throw new MailDeliveryError("All configured mail providers failed.", {
        code: "MAIL_PROVIDERS_FAILED",
        details: failures,
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getAppOrigin() {
    return getAppUrl();
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
    });
}

function formatEventDate(value) {
    if (!value) return "Siehe Eventseite";
    return new Date(value).toLocaleString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function mailParagraph(content, style = "") {
    return `<p style="margin:0 0 16px; font-size:16px; line-height:1.58; color:#292929; ${style}">${content}</p>`;
}

function mailButton({ href, label, tone = "primary" }) {
    const colors = {
        primary: { background: "#C8FF2E", color: "#111111", border: "#C8FF2E" },
        success: { background: "#111111", color: "#F7F7F3", border: "#111111" },
        warning: { background: "#292929", color: "#F7F7F3", border: "#292929" },
        danger: { background: "#111111", color: "#F7F7F3", border: "#111111" },
    };
    const theme = colors[tone] || colors.primary;
    return `
        <a href="${escapeHtml(href)}" style="display:inline-block; margin:4px 0 18px; padding:14px 20px; border:1px solid ${theme.border}; border-radius:6px; background:${theme.background}; color:${theme.color}; text-decoration:none; font-size:15px; font-weight:700;">
            ${escapeHtml(label)}
        </a>
    `;
}

function fallbackLink(url) {
    const safeUrl = escapeHtml(url);
    return `
        <p style="margin:8px 0 0; font-size:13px; line-height:1.5; color:#64645f;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
        <p style="margin:6px 0 0; font-size:13px; line-height:1.5; color:#111111; word-break:break-all;">${safeUrl}</p>
    `;
}

function detailRows(rows) {
    return rows
        .filter((row) => row?.value !== undefined && row?.value !== null && String(row.value).length > 0)
        .map(
            ({ label, value }) => `
                <tr>
                    <td style="padding:9px 0; color:#111111; font-size:14px; line-height:1.4; vertical-align:top;">
                        <div style="margin:0 0 4px; color:#64645f; font-size:12px; line-height:1.3;">${escapeHtml(label)}</div>
                        <div style="font-weight:700; word-break:break-word; overflow-wrap:anywhere;">${escapeHtml(value)}</div>
                    </td>
                </tr>
            `
        )
        .join("");
}

function infoCard({ label, title, rows = [], body = "", tone = "default" }) {
    const tones = {
        default: { border: "#D8D8D2", background: "#F7F7F3", label: "#111111", marker: "#C8FF2E" },
        neutral: { border: "#D8D8D2", background: "#F7F7F3", label: "#111111", marker: "#D8D8D2" },
        success: { border: "#D8D8D2", background: "#F7F7F3", label: "#111111", marker: "#C8FF2E" },
        warning: { border: "#E6A52E", background: "#F7F7F3", label: "#111111", marker: "#E6A52E" },
        danger: { border: "#D94343", background: "#F7F7F3", label: "#111111", marker: "#D94343" },
    };
    const theme = tones[tone] || tones.default;
    const rowHtml = rows.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-top:10px;">${detailRows(rows)}</table>`
        : "";

    return `
        <div style="margin:22px 0; padding:18px; border:1px solid ${theme.border}; border-left:6px solid ${theme.marker}; border-radius:10px; background:${theme.background};">
            ${label ? `<div style="font-size:12px; font-weight:800; color:${theme.label}; text-transform:uppercase; letter-spacing:0;">${escapeHtml(label)}</div>` : ""}
            ${title ? `<h2 style="margin:6px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:1.18; color:#111111;">${escapeHtml(title)}</h2>` : ""}
            ${body ? `<div style="margin-top:10px; font-size:14px; line-height:1.6; color:#292929;">${body}</div>` : ""}
            ${rowHtml}
        </div>
    `;
}

function nextSteps(items) {
    return `
        <div style="margin:22px 0 6px;">
            <div style="font-size:12px; font-weight:800; color:#111111; text-transform:uppercase; letter-spacing:0;">N&auml;chste Schritte</div>
            <ol style="margin:10px 0 0 20px; padding:0; color:#292929; font-size:14px; line-height:1.65;">
                ${items.map((item) => `<li style="padding-left:4px;">${item}</li>`).join("")}
            </ol>
        </div>
    `;
}

function customerMailLayout({ eyebrow = "Gatekeeper", title, preheader, children, footerReason = "" }) {
    return `
        <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(preheader || title)}</div>
        <div style="margin:0; padding:0; background:#D8D8D2; font-family:Arial, Helvetica, sans-serif; color:#111111;">
            <div style="max-width:660px; margin:0 auto; padding:28px 14px;">
                <div style="background:#F7F7F3; border:1px solid #111111; border-radius:10px; overflow:hidden;">
                    <div style="padding:28px 28px 22px; background:#111111; color:#F7F7F3;">
                        <div style="width:72px; height:8px; background:#C8FF2E; margin:0 0 22px;"></div>
                        <div style="font-size:13px; font-weight:800; letter-spacing:0; text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
                        <h1 style="margin:12px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:32px; line-height:1.08; letter-spacing:0;">${escapeHtml(title)}</h1>
                    </div>
                    <div style="padding:28px;">
                        ${children}
                    </div>
                </div>
                <p style="margin:18px 8px 0; color:#64645f; font-size:12px; line-height:1.55;">${footerReason || "Du bekommst diese Mail als transaktionale Gatekeeper-Nachricht."}</p>
            </div>
        </div>
    `;
}

function bookingRows(booking, extraRows = []) {
    return [
        { label: "Event", value: booking.event?.title || "Event" },
        { label: "Datum", value: formatEventDate(booking.event?.startDate) },
        { label: "Ort", value: [booking.event?.location, booking.event?.city].filter(Boolean).join(", ") || "Siehe Eventseite" },
        { label: "Tickets", value: `${booking.quantity || 1}x${booking.ticketTypeName ? ` ${booking.ticketTypeName}` : ""}` },
        { label: "Buchung", value: `#${booking.id}` },
        ...extraRows,
    ];
}

function paymentInstructionCard(paymentDetails, booking, intro) {
    if (paymentDetails.paymentMethod === "BANK_TRANSFER") {
        return infoCard({
            label: "Zahlungsdaten",
            title: "Bank&uuml;berweisung",
            tone: "neutral",
            body: intro ? `<p style="margin:0 0 10px;">${intro}</p>` : "",
            rows: [
                { label: "Kontoinhaber", value: paymentDetails.accountHolder || "Gatekeeper" },
                { label: "IBAN", value: paymentDetails.iban || "Noch nicht konfiguriert" },
                { label: "BIC", value: paymentDetails.bic || "Noch nicht konfiguriert" },
                { label: "Verwendungszweck", value: paymentDetails.paymentReference },
            ],
        });
    }

    return infoCard({
        label: "Rechnung",
        title: "Bitte mit Referenz &uuml;berweisen",
        tone: "warning",
        body: `<p style="margin:0;">${intro || "Die Rechnung wurde f&uuml;r diese Buchung erstellt. Bitte &uuml;berweise den offenen Betrag unter Angabe der Zahlungsreferenz."}</p>`,
        rows: [
            {
                label: "Rechnungsadresse",
                value: `${booking.billingName || booking.purchaserName}, ${booking.billingStreet || "-"}, ${booking.billingPostalCode || "-"} ${booking.billingCity || "-"}`,
            },
        ],
    });
}

export async function sendContactRequestEmail(contactRequest) {
    const recipient = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM;
    if (!recipient) {
        throw new MailDeliveryError("CONTACT_EMAIL or EMAIL_FROM is missing.", {
            code: "CONTACT_RECIPIENT_MISSING",
        });
    }

    const topicLabels = {
        booking: "Buchung",
        organizer: "Veranstalter",
        privacy: "Datenschutz",
        technical: "Technisches Problem",
        legal: "Rechtliches",
        general: "Allgemeine Anfrage",
    };
    const topic = topicLabels[contactRequest.topic] || "Allgemeine Anfrage";
    const bookingNumber = contactRequest.bookingNumber
        ? escapeHtml(contactRequest.bookingNumber)
        : "Nicht angegeben";

    const emailHtml = customerMailLayout({
        eyebrow: "Gatekeeper Kontakt",
        title: "Neue Kontaktanfrage",
        preheader: `${topic} von ${contactRequest.name || contactRequest.email}`,
        footerReason: "Diese interne Nachricht wurde \u00fcber das Gatekeeper-Kontaktformular ausgel\u00f6st.",
        children: `
            ${infoCard({
                label: "Anfrage",
                title: topic,
                rows: [
                    { label: "Name", value: contactRequest.name },
                    { label: "E-Mail", value: contactRequest.email },
                    { label: "Buchungsnummer", value: bookingNumber },
                ],
            })}
            <div style="margin:22px 0 0; padding:18px; border:1px solid #D8D8D2; border-radius:10px; background:#F7F7F3;">
                <div style="font-size:12px; font-weight:800; color:#111111; text-transform:uppercase; letter-spacing:0;">Nachricht</div>
                <div style="margin-top:10px; white-space:pre-wrap; font-size:15px; line-height:1.65; color:#292929;">${escapeHtml(contactRequest.message)}</div>
            </div>
        `,
    });

    return await sendTransactionalMail({
        fromLabel: "Gatekeeper Kontakt",
        to: recipient,
        replyTo: contactRequest.email,
        subject: `Kontaktanfrage: ${topic}`,
        html: emailHtml,
    });
}

// Hilfsfunktion zur Erstellung des PDF-Tickets im Speicher
export function generateTicketPDF(booking, qrCodeDataUrl, ticketCode) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A6", margin: 20 }); // Kompakteres Ticket-Format
        let buffers = [];

        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });
        doc.on("error", (err) => reject(err));

        // --- PDF DESIGN ---
        // Rahmen & Header
        doc.rect(10, 10, doc.page.width - 20, doc.page.height - 20).stroke("#D8D8D2");

        doc.fillColor("#3b82f6").fontSize(10).font("Helvetica-Bold").text("GATEKEEPER E-TICKET", 20, 25);
        doc.fillColor("#64748b").fontSize(8).font("Helvetica").text(`# ${booking.id}`, doc.page.width - 80, 25, { align: "right", width: 60 });

        // Trennlinie
        doc.moveTo(20, 42).lineTo(doc.page.width - 20, 42).stroke("#f1f5f9");

        // Event Titel
        doc.fillColor("#1e293b").fontSize(14).font("Helvetica-Bold").text(booking.event?.title || "Event", 20, 55, { width: doc.page.width - 40 });

        // Details
        doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("DATUM & UHRZEIT", 20, 95);
        const eventDate = booking.event?.startDate ? new Date(booking.event.startDate).toLocaleString("de-DE", {
            style: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        }) : "Siehe Eventseite";
        doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(eventDate, 20, 107);

        doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("LOCATION", 20, 130);
        doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(`${booking.event?.location || "—"}, ${booking.event?.city || "—"}`, 20, 142);

        doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("TICKET-INHABER", 20, 165);
        doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(booking.purchaserName || "Gast", 20, 177);

        doc.fillColor("#64748b").fontSize(8).font("Helvetica-Bold").text("ANZAHL", 20, 200);
        doc.fillColor("#1e293b").fontSize(11).font("Helvetica-Bold").text(`${booking.quantity}x Einlass`, 20, 212);

        if (ticketCode) {
            doc.fillColor("#64748b").fontSize(7).font("Helvetica-Bold").text("TICKET-CODE", 20, 232);
            doc.fillColor("#1e293b").fontSize(8).font("Helvetica").text(ticketCode, 20, 242, {
                width: doc.page.width - 40,
            });
        }

        // QR-Code einbetten (Unten zentriert)
        // qrCodeDataUrl ist ein Base64-String, pdfkit kann diesen direkt via Image-Schnittstelle verarbeiten
        doc.image(qrCodeDataUrl, (doc.page.width / 2) - 45, doc.page.height - 115, { width: 90, height: 90 });

        doc.fillColor("#64748b").fontSize(7).font("Helvetica").text("Bitte beim Einlass auf dem Smartphone vorzeigen.", 20, doc.page.height - 22, { align: "center", width: doc.page.width - 40 });

        doc.end();
    });
}

export async function sendRegistrationWelcomeEmail(user) {
    const appOrigin = getAppOrigin();
    const loginUrl = `${appOrigin}/auth`;

    const emailHtml = customerMailLayout({
        title: "Willkommen bei Gatekeeper",
        preheader: "Dein Konto ist bereit. Melde dich an und verwalte deine Tickets.",
        footerReason: "Du bekommst diese Mail, weil mit dieser E-Mail-Adresse ein Gatekeeper-Konto erstellt wurde.",
        children: `
            ${mailParagraph(`Hallo ${escapeHtml(user.name || "du")},`)}
            ${mailParagraph("dein Konto ist bereit. In deinem Dashboard findest du Buchungen, Tickets und gespeicherte Events an einem Ort.")}
            ${infoCard({
                label: "Konto",
                title: user.email,
                tone: "success",
                body: "<p style=\"margin:0;\">Melde dich an, um deine Gatekeeper-Aktivit\u00e4ten zu verwalten.</p>",
            })}
            ${mailButton({ href: loginUrl, label: "Zum Dashboard", tone: "success" })}
            ${fallbackLink(loginUrl)}
        `,
    });

    await sendTransactionalMail({
        fromLabel: "Gatekeeper",
        to: user.email,
        subject: "Willkommen bei Gatekeeper",
        html: emailHtml,
    });
}

export async function sendAccountVerificationEmail(user, verificationUrl) {
    const emailHtml = customerMailLayout({
        eyebrow: "Gatekeeper Sicherheit",
        title: "E-Mail best\u00e4tigen",
        preheader: "Ein Klick aktiviert dein Gatekeeper-Konto.",
        children: `
            ${mailParagraph(`Hallo ${escapeHtml(user.name || "du")},`)}
            ${mailParagraph("best\u00e4tige deine E-Mail-Adresse, um dein Gatekeeper-Konto zu aktivieren. Danach kannst du dich anmelden und Buchungen verwalten.")}
            ${mailButton({ href: verificationUrl, label: "Konto aktivieren", tone: "primary" })}
            ${infoCard({
                label: "Warum diese Mail?",
                title: "Schutz f\u00fcr dein Konto",
                body: "<p style=\"margin:0;\">Gatekeeper aktiviert neue Konten erst nach best\u00e4tigter E-Mail-Adresse.</p>",
            })}
            ${fallbackLink(verificationUrl)}
        `,
    });

    return await sendTransactionalMail({
        fromLabel: "Gatekeeper Sicherheit",
        to: user.email,
        subject: "Gatekeeper Konto aktivieren",
        html: emailHtml,
    });
}

export async function sendPasswordResetEmail(user, resetUrl) {
    const emailHtml = customerMailLayout({
        eyebrow: "Gatekeeper Sicherheit",
        title: "Passwort zur\u00fccksetzen",
        preheader: "Setze dein Passwort zur\u00fcck. Wenn du das nicht warst, kannst du die Mail ignorieren.",
        children: `
            ${mailParagraph(`Hallo ${escapeHtml(user.name || "du")},`)}
            ${mailParagraph("f\u00fcr dein Gatekeeper-Konto wurde ein neues Passwort angefordert. Wenn du das warst, kannst du jetzt ein neues Passwort setzen.")}
            ${mailButton({ href: resetUrl, label: "Neues Passwort setzen", tone: "primary" })}
            ${infoCard({
                label: "Sicherheit",
                title: "Nicht angefordert?",
                tone: "warning",
                body: "<p style=\"margin:0;\">Dann kannst du diese Mail ignorieren. Dein bisheriges Passwort bleibt unver\u00e4ndert.</p>",
            })}
            ${fallbackLink(resetUrl)}
        `,
    });

    return await sendTransactionalMail({
        fromLabel: "Gatekeeper Sicherheit",
        to: user.email,
        subject: "Gatekeeper Passwort zur\u00fccksetzen",
        html: emailHtml,
    });
}

// Hauptfunktion zum E-Mail-Versand
export async function sendTicketEmail(booking) {
    try {
        // 1. QR-Code f\u00fcr E-Mail und PDF generieren
        const ticketCode = createTicketCode(booking.id);
        const qrCodeDataUrl = await QRCode.toDataURL(ticketCode);

        // 2. PDF im Buffer generieren
        const pdfBuffer = await generateTicketPDF(booking, qrCodeDataUrl, ticketCode);

        const dashboardUrl = `${getAppOrigin()}/dashboard`;
        const emailHtml = customerMailLayout({
            eyebrow: "Gatekeeper Tickets",
            title: "Deine Tickets sind best\u00e4tigt",
            preheader: `${booking.event?.title || "Dein Event"} ist gebucht. QR-Code und PDF-Ticket sind bereit.`,
            footerReason: "Du bekommst diese Mail, weil du \u00fcber Gatekeeper ein Ticket gebucht hast.",
            children: `
                ${mailParagraph(`Hallo ${escapeHtml(booking.purchaserName || "du")},`)}
                ${mailParagraph(`deine Zahlung ist eingegangen. Deine Buchung f\u00fcr <strong>${escapeHtml(booking.event?.title || "das Event")}</strong> ist best\u00e4tigt.`)}
                ${infoCard({
                    label: "Best\u00e4tigte Buchung",
                    title: booking.event?.title || "Event",
                    tone: "success",
                    rows: bookingRows(booking, [{ label: "Ticket-Code", value: ticketCode }]),
                })}
                <div style="margin:22px 0; text-align:center; padding:20px; border:1px solid #D8D8D2; border-radius:10px; background:#F7F7F3;">
                    <div style="font-size:12px; font-weight:800; color:#111111; text-transform:uppercase;">Einlass</div>
                    <img src="${qrCodeDataUrl}" alt="QR-Code Einlass" width="156" height="156" style="display:block; width:156px; height:156px; margin:12px auto; border:1px solid #D8D8D2; padding:6px; background:#F7F7F3;" />
                    <p style="margin:0; font-size:14px; line-height:1.55; color:#292929;">Zeige diesen QR-Code am Einlass auf deinem Smartphone vor. Das druckfertige PDF-Ticket h\u00e4ngt zus\u00e4tzlich an dieser E-Mail.</p>
                </div>
                ${mailButton({ href: dashboardUrl, label: "Buchungen \u00f6ffnen", tone: "success" })}
                ${fallbackLink(dashboardUrl)}
            `,
        });

        // 4. E-Mail absenden
        await sendTransactionalMail({
            fromLabel: "Gatekeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Deine Tickets f\u00fcr ${booking.event?.title} (#${booking.id})`,
            html: emailHtml,
            attachments: [
                {
                    filename: `Ticket-${booking.id}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf"
                }
            ]
        });
    } catch (error) {
        console.error("[Mail-Service] Fehler beim Generieren/Senden des Tickets:", error);
        throw error;
    }
}

export async function sendManualPaymentEmail(booking, paymentDetails) {
    try {
        const subjectPrefix =
            paymentDetails.paymentMethod === "INVOICE"
                ? "Rechnung"
                : "Bank\u00fcberweisung";

        const dashboardUrl = `${getAppOrigin()}/dashboard`;
        const emailHtml = customerMailLayout({
            eyebrow: "Gatekeeper Zahlung",
            title: "Deine Buchung wartet auf Zahlung",
            preheader: `Bitte nutze die Zahlungsreferenz ${paymentDetails.paymentReference}, damit dein Ticket freigeschaltet werden kann.`,
            footerReason: "Du bekommst diese Mail, weil du eine Gatekeeper-Buchung mit manueller Zahlung gestartet hast.",
            children: `
                ${mailParagraph(`Hallo ${escapeHtml(booking.purchaserName || "du")},`)}
                ${mailParagraph(`deine Buchung f\u00fcr <strong>${escapeHtml(booking.event?.title || "das Event")}</strong> ist eingegangen. Sobald die Zahlung zugeordnet ist, wird dein Ticket freigeschaltet.`)}
                ${infoCard({
                    label: "Offene Zahlung",
                    title: subjectPrefix,
                    tone: "warning",
                    rows: bookingRows(booking, [
                        { label: "Betrag", value: formatCurrency(booking.totalAmount) },
                        { label: "F\u00e4llig bis", value: paymentDetails.dueDate },
                        { label: "Zahlungsreferenz", value: paymentDetails.paymentReference },
                    ]),
                })}
                ${paymentInstructionCard(paymentDetails, booking, "Bitte \u00fcberweise den offenen Betrag mit exakt dieser Referenz, damit die Zahlung automatisch zugeordnet werden kann.")}
                ${nextSteps([
                    "Zahlung mit der angegebenen Referenz ausf\u00fchren.",
                    "Best\u00e4tigungsmail abwarten. Danach ist dein Ticket im Dashboard verf\u00fcgbar.",
                    "Bei R\u00fcckfragen die Buchungsnummer bereithalten.",
                ])}
                ${mailButton({ href: dashboardUrl, label: "Buchung ansehen", tone: "warning" })}
                ${fallbackLink(dashboardUrl)}
            `,
        });

        await sendTransactionalMail({
            fromLabel: "Gatekeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Deine ${subjectPrefix}-Buchung f\u00fcr ${booking.event?.title || "Gatekeeper"}`,
            html: emailHtml,
        });
    } catch (error) {
        console.error("[Mail-Service] Fehler beim Senden der Zahlungs-Mail:", error);
        throw error;
    }
}

export async function sendPaymentReminderEmail(booking, paymentDetails, reminderState) {
    try {
        const subjectPrefix =
            paymentDetails.paymentMethod === "INVOICE"
                ? "Rechnung"
                : "Bank\u00fcberweisung";

        const dashboardUrl = `${getAppOrigin()}/dashboard`;
        const emailHtml = customerMailLayout({
            eyebrow: "Gatekeeper Zahlung",
            title: "Zahlung noch offen",
            preheader: `Erinnerung ${reminderState.reminderCount + 1}: Deine Buchung wartet noch auf Zahlung.`,
            footerReason: "Du bekommst diese Mail, weil f\u00fcr deine Gatekeeper-Buchung noch eine Zahlung offen ist.",
            children: `
                ${mailParagraph(`Hallo ${escapeHtml(booking.purchaserName || "du")},`)}
                ${mailParagraph(`f\u00fcr deine Buchung <strong>${escapeHtml(booking.event?.title || "das Event")}</strong> ist noch eine Zahlung offen. Bitte begleiche sie rechtzeitig, damit deine Pl\u00e4tze nicht verloren gehen.`)}
                ${infoCard({
                    label: `Erinnerung ${reminderState.reminderCount + 1}`,
                    title: subjectPrefix,
                    tone: "warning",
                    rows: bookingRows(booking, [
                        { label: "Betrag", value: formatCurrency(booking.totalAmount) },
                        { label: "F\u00e4llig bis", value: paymentDetails.dueDate },
                        { label: "Zahlungsreferenz", value: paymentDetails.paymentReference },
                    ]),
                })}
                ${paymentInstructionCard(paymentDetails, booking, "Falls du bereits gezahlt hast, kann die Zuordnung je nach Banklaufzeit etwas dauern. Wichtig ist die korrekte Zahlungsreferenz.")}
                ${mailButton({ href: dashboardUrl, label: "Buchung pr\u00fcfen", tone: "warning" })}
                ${fallbackLink(dashboardUrl)}
            `,
        });

        await sendTransactionalMail({
            fromLabel: "Gatekeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Erinnerung: ${subjectPrefix}-Buchung f\u00fcr ${booking.event?.title || "Gatekeeper"}`,
            html: emailHtml,
        });
    } catch (error) {
        console.error("[Mail-Service] Fehler beim Senden der Erinnerungs-Mail:", error);
        throw error;
    }
}

export async function sendPaymentCancellationEmail(booking, paymentDetails, reason) {
    try {
        const subjectPrefix =
            paymentDetails.paymentMethod === "INVOICE"
                ? "Rechnung"
                : "Bank\u00fcberweisung";

        const eventUrl = booking.event?.id ? `${getAppOrigin()}/events/${booking.event.id}` : getAppOrigin();
        const emailHtml = customerMailLayout({
            eyebrow: "Gatekeeper Zahlung",
            title: "Buchung storniert",
            preheader: "Deine Buchung wurde storniert, weil die Zahlung nicht rechtzeitig eingegangen ist.",
            footerReason: "Du bekommst diese Mail als Statusinformation zu deiner Gatekeeper-Buchung.",
            children: `
                ${mailParagraph(`Hallo ${escapeHtml(booking.purchaserName || "du")},`)}
                ${mailParagraph(`deine Buchung f\u00fcr <strong>${escapeHtml(booking.event?.title || "das Event")}</strong> wurde storniert, weil die Zahlung nicht rechtzeitig eingegangen ist.`)}
                ${infoCard({
                    label: "Status",
                    title: "Storniert",
                    tone: "danger",
                    rows: bookingRows(booking, [
                        { label: "Zahlungsreferenz", value: paymentDetails.paymentReference },
                        { label: "Grund", value: reason },
                    ]),
                })}
                ${mailParagraph("Wenn du das Event weiterhin besuchen m\u00f6chtest, kannst du eine neue Buchung anlegen, sofern noch Pl\u00e4tze verf\u00fcgbar sind.")}
                ${mailButton({ href: eventUrl, label: "Event ansehen", tone: "danger" })}
                ${fallbackLink(eventUrl)}
            `,
        });

        await sendTransactionalMail({
            fromLabel: "Gatekeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Buchung storniert: ${subjectPrefix} f\u00fcr ${booking.event?.title || "Gatekeeper"}`,
            html: emailHtml,
        });
    } catch (error) {
        console.error("[Mail-Service] Fehler beim Senden der Storno-Mail:", error);
        throw error;
    }
}

export async function sendEventAlertEmail(alert, event) {
    try {
        const subjectParts = ["Neues Event"];
        if (event.city) subjectParts.push(event.city);
        subjectParts.push(event.title);

        const eventUrl = event.id ? `${getAppOrigin()}/events/${event.id}` : getAppOrigin();
        const emailHtml = customerMailLayout({
            eyebrow: "Gatekeeper Events",
            title: "Neues Event gefunden",
            preheader: `${event.title} passt zu deinem Gatekeeper-Suchalarm.`,
            footerReason: "Du bekommst diese Mail, weil du bei Gatekeeper einen Suchalarm gespeichert hast.",
            children: `
                ${mailParagraph("Dein Suchalarm hat ein neues Event gefunden. Hier sind die wichtigsten Daten auf einen Blick.")}
                ${infoCard({
                    label: "Event-Alert",
                    title: event.title,
                    rows: [
                        { label: "Datum", value: formatEventDate(event.startDate) },
                        { label: "Ort", value: [event.location, event.city].filter(Boolean).join(", ") || "Siehe Eventseite" },
                        { label: "Suchfilter", value: alert.query || alert.city || alert.category || "allgemein" },
                    ],
                })}
                ${mailButton({ href: eventUrl, label: "Event ansehen", tone: "primary" })}
                ${fallbackLink(eventUrl)}
            `,
        });

        await sendTransactionalMail({
            fromLabel: "Gatekeeper Events",
            to: alert.user?.email,
            subject: subjectParts.filter(Boolean).join(" - "),
            html: emailHtml,
        });
    } catch (error) {
        console.error("[Mail-Service] Fehler beim Senden der Event-Alert-Mail:", error);
        throw error;
    }
}
