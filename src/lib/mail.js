import nodemailer from "nodemailer";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { createIndividualTicketCode, createTicketCode } from "./tickets.js";
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

function buildFrom(label = "GateKeeper") {
    const from = process.env.EMAIL_FROM?.trim();
    if (!from) {
        throw new MailDeliveryError("EMAIL_FROM is missing.", {
            code: "MAIL_FROM_MISSING",
        });
    }
    if (/^[^<>]+<[^<>]+>$/.test(from)) {
        return from;
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

export async function sendTransactionalMail({ fromLabel = "GateKeeper", ...message }) {
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

// Hilfsfunktion zur Erstellung des PDF-Tickets im Speicher
function generateTicketPDF(booking, qrCodeDataUrl, ticketCode) {
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
        doc.rect(10, 10, doc.page.width - 20, doc.page.height - 20).stroke("#e2e8f0");

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
    const name = escapeHtml(user.name || "du");
    const loginUrl = `${appOrigin}/auth`;

    const emailHtml = `
        <div style="margin:0; padding:0; background:#eef6f2; font-family: Arial, Helvetica, sans-serif; color:#241d18;">
            <div style="max-width:640px; margin:0 auto; padding:28px 16px;">
                <div style="background:#fffdf8; border:1px solid rgba(36,29,24,0.10); border-radius:16px; overflow:hidden; box-shadow:0 18px 44px rgba(36,29,24,0.08);">
                    <div style="padding:28px 28px 18px; background:linear-gradient(135deg, #0f766e 0%, #355c7d 58%, #e85d3f 100%); color:#ffffff;">
                        <div style="font-size:13px; font-weight:700; letter-spacing:0; text-transform:uppercase; opacity:0.86;">GateKeeper</div>
                        <h1 style="margin:12px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size:34px; line-height:1.02; letter-spacing:0;">Willkommen bei GateKeeper</h1>
                    </div>

                    <div style="padding:28px;">
                        <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">Hallo ${name},</p>
                        <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">dein Konto wurde erstellt und ist sofort einsatzbereit. Du kannst dich jetzt anmelden, Events entdecken und deine Tickets verwalten.</p>

                        <div style="margin:22px 0; padding:18px; border:1px solid rgba(15,118,110,0.18); border-radius:12px; background:#e9f7f1;">
                            <div style="font-size:12px; font-weight:800; color:#0f766e; text-transform:uppercase;">Konto</div>
                            <div style="margin-top:6px; font-size:15px; color:#3f4a45;">${escapeHtml(user.email)}</div>
                        </div>

                        <a href="${loginUrl}" style="display:inline-block; margin:4px 0 18px; padding:13px 18px; border-radius:12px; background:#e85d3f; color:#ffffff; text-decoration:none; font-weight:800;">Jetzt anmelden</a>

                        <p style="margin:12px 0 0; font-size:14px; line-height:1.6; color:#51615b;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                        <p style="margin:6px 0 0; font-size:13px; line-height:1.5; color:#0f766e; word-break:break-all;">${loginUrl}</p>
                    </div>
                </div>

                <p style="margin:18px 8px 0; color:#51615b; font-size:12px; line-height:1.5;">Du bekommst diese Mail, weil mit dieser E-Mail-Adresse ein GateKeeper-Konto erstellt wurde.</p>
            </div>
        </div>
    `;

    await sendTransactionalMail({
        fromLabel: "GateKeeper",
        to: user.email,
        subject: "Willkommen bei GateKeeper",
        html: emailHtml,
    });
}

export async function sendAccountVerificationEmail(user, verificationUrl) {
    const name = escapeHtml(user.name || "du");
    const safeVerificationUrl = escapeHtml(verificationUrl);

    const emailHtml = `
        <div style="margin:0; padding:0; background:#eef6f2; font-family: Arial, Helvetica, sans-serif; color:#241d18;">
            <div style="max-width:640px; margin:0 auto; padding:28px 16px;">
                <div style="background:#fffdf8; border:1px solid rgba(36,29,24,0.10); border-radius:16px; overflow:hidden; box-shadow:0 18px 44px rgba(36,29,24,0.08);">
                    <div style="padding:28px 28px 18px; background:linear-gradient(135deg, #0f766e 0%, #355c7d 58%, #e85d3f 100%); color:#ffffff;">
                        <div style="font-size:13px; font-weight:700; letter-spacing:0; text-transform:uppercase; opacity:0.86;">GateKeeper</div>
                        <h1 style="margin:12px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size:34px; line-height:1.02; letter-spacing:0;">E-Mail bestätigen</h1>
                    </div>

                    <div style="padding:28px;">
                        <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">Hallo ${name},</p>
                        <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">bestätige deine E-Mail-Adresse, um dein GateKeeper-Konto zu aktivieren. Danach kannst du dich anmelden.</p>

                        <a href="${safeVerificationUrl}" style="display:inline-block; margin:8px 0 20px; padding:13px 18px; border-radius:12px; background:#e85d3f; color:#ffffff; text-decoration:none; font-weight:800;">Konto aktivieren</a>

                        <div style="margin:8px 0 0; padding:16px; border:1px solid rgba(15,118,110,0.18); border-radius:12px; background:#e9f7f1;">
                            <div style="font-size:12px; font-weight:800; color:#0f766e; text-transform:uppercase;">Warum diese Mail?</div>
                            <p style="margin:8px 0 0; font-size:14px; line-height:1.6; color:#3f4a45;">GateKeeper aktiviert neue Konten erst nach bestätigter E-Mail-Adresse.</p>
                        </div>

                        <p style="margin:18px 0 0; font-size:14px; line-height:1.6; color:#51615b;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                        <p style="margin:6px 0 0; font-size:13px; line-height:1.5; color:#0f766e; word-break:break-all;">${safeVerificationUrl}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    return await sendTransactionalMail({
        fromLabel: "GateKeeper Sicherheit",
        to: user.email,
        subject: "GateKeeper Konto aktivieren",
        html: emailHtml,
    });
}

export async function sendPasswordResetEmail(user, resetUrl) {
    const name = escapeHtml(user.name || "du");
    const safeResetUrl = escapeHtml(resetUrl);

    const emailHtml = `
        <div style="margin:0; padding:0; background:#eef6f2; font-family: Arial, Helvetica, sans-serif; color:#241d18;">
            <div style="max-width:640px; margin:0 auto; padding:28px 16px;">
                <div style="background:#fffdf8; border:1px solid rgba(36,29,24,0.10); border-radius:16px; overflow:hidden; box-shadow:0 18px 44px rgba(36,29,24,0.08);">
                    <div style="padding:28px 28px 18px; background:linear-gradient(135deg, #0f766e 0%, #355c7d 58%, #e85d3f 100%); color:#ffffff;">
                        <div style="font-size:13px; font-weight:700; letter-spacing:0; text-transform:uppercase; opacity:0.86;">GateKeeper</div>
                        <h1 style="margin:12px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size:34px; line-height:1.02; letter-spacing:0;">Passwort zurücksetzen</h1>
                    </div>

                    <div style="padding:28px;">
                        <p style="margin:0 0 16px; font-size:16px; line-height:1.6;">Hallo ${name},</p>
                        <p style="margin:0 0 18px; font-size:16px; line-height:1.6;">für dein GateKeeper-Konto wurde ein neues Passwort angefordert. Wenn du das warst, kannst du jetzt ein neues Passwort setzen.</p>

                        <a href="${safeResetUrl}" style="display:inline-block; margin:8px 0 20px; padding:13px 18px; border-radius:12px; background:#e85d3f; color:#ffffff; text-decoration:none; font-weight:800;">Neues Passwort setzen</a>

                        <div style="margin:8px 0 0; padding:16px; border:1px solid rgba(15,118,110,0.18); border-radius:12px; background:#e9f7f1;">
                            <div style="font-size:12px; font-weight:800; color:#0f766e; text-transform:uppercase;">Sicherheit</div>
                            <p style="margin:8px 0 0; font-size:14px; line-height:1.6; color:#3f4a45;">Wenn du diese Anfrage nicht gestellt hast, kannst du diese Mail ignorieren. Dein bisheriges Passwort bleibt dann unverändert.</p>
                        </div>

                        <p style="margin:18px 0 0; font-size:14px; line-height:1.6; color:#51615b;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
                        <p style="margin:6px 0 0; font-size:13px; line-height:1.5; color:#0f766e; word-break:break-all;">${safeResetUrl}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    return await sendTransactionalMail({
        fromLabel: "GateKeeper Sicherheit",
        to: user.email,
        subject: "GateKeeper Passwort zurücksetzen",
        html: emailHtml,
    });
}

// Hauptfunktion zum E-Mail-Versand
export async function sendTicketEmail(booking) {
    try {
        // 1. QR-Code für E-Mail und PDF generieren
        const ticketRecords = Array.isArray(booking.tickets) && booking.tickets.length > 0
            ? booking.tickets
            : [{ id: booking.id, ticketNumber: 1, legacy: true }];
        const ticketCodes = ticketRecords.map((ticket) => ({
            ...ticket,
            code: ticket.legacy
                ? createTicketCode(booking.id)
                : createIndividualTicketCode(ticket.id),
        }));
        const ticketCode = ticketCodes[0].code;
        const qrCodeDataUrl = await QRCode.toDataURL(ticketCode);

        // 2. PDF im Buffer generieren
        const pdfBuffer = await generateTicketPDF(booking, qrCodeDataUrl, ticketCode);

        // 3. HTML-Body für die Mail definieren
        const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 8px;">
                <h2 style="color: #3b82f6;">Hallo ${booking.purchaserName},</h2>
                <p>deine Zahlung war erfolgreich! Dein Ticket für das Event ist hiermit fest gebucht.</p>
                
                <div style="background-color: #f8fafc; border: 1px dashed #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                    <span style="font-size: 0.8rem; font-weight: bold; color: #3b82f6; letter-spacing: 0.05em; display: block; margin-bottom: 5px;">BESTÄTIGTE BUCHUNG</span>
                    <h3 style="margin: 0 0 15px 0; font-size: 1.4rem; color: #1e293b;">${booking.event?.title}</h3>
                    
                    <p style="margin: 5px 0;"><strong>Anzahl:</strong> ${booking.quantity}x Ticket(s)</p>
                    ${
                        booking.ticketTypeName
                            ? `<p style="margin: 5px 0;"><strong>Tickettyp:</strong> ${booking.ticketTypeName}</p>`
                            : ""
                    }
                    <p style="margin: 5px 0;"><strong>Buchungs-ID:</strong> #${booking.id}</p>
                    <p style="margin: 5px 0; font-size: 0.85rem;"><strong>Ticket-Code:</strong> ${ticketCode}</p>
                    ${
                        ticketCodes.length > 1
                            ? `<p style="margin: 5px 0; font-size: 0.85rem;"><strong>Weitere Ticket-Codes:</strong><br>${ticketCodes
                                  .slice(1)
                                  .map((ticket) => `#${ticket.ticketNumber}: ${ticket.code}`)
                                  .join("<br>")}</p>`
                            : ""
                    }
                    
                    <div style="margin: 20px 0;">
                        <img src="${qrCodeDataUrl}" alt="QR-Code Einlass" width="140" height="140" style="border: 1px solid #e2e8f0; padding: 5px; background: #fff;" />
                    </div>
                    <span style="font-size: 0.8rem; color: #64748b;">Du kannst den QR-Code direkt aus dieser Mail oder dem angehängten PDF-Ticket am Einlass scannen lassen.</span>
                </div>
                
                <p>Dein Ticket findest du zusätzlich als druckfertiges <strong>PDF im Anhang</strong> dieser E-Mail.</p>
                <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8;">Dein GateKeeper Team</p>
            </div>
        `;

        // 4. E-Mail absenden
        await sendTransactionalMail({
            fromLabel: "GateKeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Deine Tickets für ${booking.event?.title} (#${booking.id})`,
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
                : "Banküberweisung";

        const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 640px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 8px;">
                <h2 style="color: #3b82f6;">Hallo ${booking.purchaserName},</h2>
                <p>deine Buchung für <strong>${booking.event?.title || "das Event"}</strong> ist eingegangen. Die Zahlung ist noch offen und wartet auf ${subjectPrefix.toLowerCase()}.</p>

                <div style="background-color: #f8fafc; border: 1px dashed #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Buchungs-ID:</strong> #${booking.id}</p>
                    ${
                        booking.ticketTypeName
                            ? `<p style="margin: 0 0 8px 0;"><strong>Tickettyp:</strong> ${booking.ticketTypeName}</p>`
                            : ""
                    }
                    <p style="margin: 0 0 8px 0;"><strong>Zahlungsreferenz:</strong> ${paymentDetails.paymentReference}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Betrag:</strong> ${Number(booking.totalAmount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
                    <p style="margin: 0;"><strong>Fällig bis:</strong> ${paymentDetails.dueDate}</p>
                </div>

                ${
                    paymentDetails.paymentMethod === "BANK_TRANSFER"
                        ? `
                <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1d4ed8;">Banküberweisung</h3>
                    <p style="margin: 6px 0;"><strong>Kontoinhaber:</strong> ${paymentDetails.accountHolder || "GateKeeper"}</p>
                    <p style="margin: 6px 0;"><strong>IBAN:</strong> ${paymentDetails.iban || "Noch nicht konfiguriert"}</p>
                    <p style="margin: 6px 0;"><strong>BIC:</strong> ${paymentDetails.bic || "Noch nicht konfiguriert"}</p>
                    <p style="margin: 6px 0;"><strong>Verwendungszweck:</strong> ${paymentDetails.paymentReference}</p>
                </div>`
                        : `
                <div style="background-color: #fefce8; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #a16207;">Rechnung</h3>
                    <p style="margin: 6px 0;">Die Rechnung wurde für diese Buchung erstellt. Bitte überweise den offenen Betrag unter Angabe der Zahlungsreferenz.</p>
                    <p style="margin: 6px 0;"><strong>Rechnungsadresse:</strong> ${booking.billingName || booking.purchaserName}, ${booking.billingStreet || "—"}, ${booking.billingPostalCode || "—"} ${booking.billingCity || "—"}</p>
                </div>`
                }

                <p>Sobald die Zahlung eingeht, wird dein Ticket im Konto freigeschaltet und du erhältst die Bestätigungsmail.</p>
                <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8;">Dein GateKeeper Team</p>
            </div>
        `;

        await sendTransactionalMail({
            fromLabel: "GateKeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Deine ${subjectPrefix}-Buchung für ${booking.event?.title || "GateKeeper"}`,
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
                : "Banküberweisung";

        const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 640px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 8px;">
                <h2 style="color: #dc2626;">Hallo ${booking.purchaserName},</h2>
                <p>für deine Buchung <strong>${booking.event?.title || "das Event"}</strong> ist noch eine Zahlung offen. Das ist eine freundliche Erinnerung, damit deine Plätze nicht verloren gehen.</p>

                <div style="background-color: #f8fafc; border: 1px dashed #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Buchungs-ID:</strong> #${booking.id}</p>
                    ${
                        booking.ticketTypeName
                            ? `<p style="margin: 0 0 8px 0;"><strong>Tickettyp:</strong> ${booking.ticketTypeName}</p>`
                            : ""
                    }
                    <p style="margin: 0 0 8px 0;"><strong>Zahlungsreferenz:</strong> ${paymentDetails.paymentReference}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Betrag:</strong> ${Number(booking.totalAmount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
                    <p style="margin: 0;"><strong>Fällig bis:</strong> ${paymentDetails.dueDate}</p>
                    <p style="margin: 8px 0 0 0;"><strong>Erinnerung:</strong> ${reminderState.reminderCount + 1}. Versand</p>
                </div>

                ${
                    paymentDetails.paymentMethod === "BANK_TRANSFER"
                        ? `
                <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1d4ed8;">Banküberweisung</h3>
                    <p style="margin: 6px 0;"><strong>Kontoinhaber:</strong> ${paymentDetails.accountHolder || "GateKeeper"}</p>
                    <p style="margin: 6px 0;"><strong>IBAN:</strong> ${paymentDetails.iban || "Noch nicht konfiguriert"}</p>
                    <p style="margin: 6px 0;"><strong>BIC:</strong> ${paymentDetails.bic || "Noch nicht konfiguriert"}</p>
                    <p style="margin: 6px 0;"><strong>Verwendungszweck:</strong> ${paymentDetails.paymentReference}</p>
                </div>`
                        : `
                <div style="background-color: #fefce8; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #a16207;">Rechnung</h3>
                    <p style="margin: 6px 0;">Bitte begleiche die offene Rechnung unter Angabe der Zahlungsreferenz.</p>
                    <p style="margin: 6px 0;"><strong>Rechnungsadresse:</strong> ${booking.billingName || booking.purchaserName}, ${booking.billingStreet || "—"}, ${booking.billingPostalCode || "—"} ${booking.billingCity || "—"}</p>
                </div>`
                }

                <p>Sobald die Zahlung eingeht, wird dein Ticket freigeschaltet und du erhältst die Bestätigungsmail.</p>
                <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8;">Dein GateKeeper Team</p>
            </div>
        `;

        await sendTransactionalMail({
            fromLabel: "GateKeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Erinnerung: ${subjectPrefix}-Buchung für ${booking.event?.title || "GateKeeper"}`,
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
                : "Banküberweisung";

        const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 640px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 8px;">
                <h2 style="color: #b91c1c;">Hallo ${booking.purchaserName},</h2>
                <p>deine Buchung <strong>${booking.event?.title || "das Event"}</strong> wurde automatisch storniert, weil die Zahlung nicht rechtzeitig eingegangen ist.</p>

                <div style="background-color: #f8fafc; border: 1px dashed #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Buchungs-ID:</strong> #${booking.id}</p>
                    ${
                        booking.ticketTypeName
                            ? `<p style="margin: 0 0 8px 0;"><strong>Tickettyp:</strong> ${booking.ticketTypeName}</p>`
                            : ""
                    }
                    <p style="margin: 0 0 8px 0;"><strong>Zahlungsreferenz:</strong> ${paymentDetails.paymentReference}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Status:</strong> Storniert</p>
                    <p style="margin: 0;"><strong>Grund:</strong> ${reason}</p>
                </div>

                <p>Wenn du das Event weiterhin besuchen möchtest, kannst du eine neue Buchung anlegen, sofern noch Plätze verfügbar sind.</p>
                <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8;">Dein GateKeeper Team</p>
            </div>
        `;

        await sendTransactionalMail({
            fromLabel: "GateKeeper Tickets",
            to: booking.purchaserEmail,
            subject: `Buchung storniert: ${subjectPrefix} für ${booking.event?.title || "GateKeeper"}`,
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

        const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 640px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 8px;">
                <h2 style="color: #3b82f6;">Ein neues Event passt zu deinem Alert</h2>
                <p>Du bekommst diese Nachricht, weil du bei GateKeeper einen Suchalarm gespeichert hast.</p>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Event:</strong> ${event.title}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Ort:</strong> ${event.location}, ${event.city}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Datum:</strong> ${new Date(event.startDate).toLocaleString("de-DE", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}</p>
                    <p style="margin: 0;"><strong>Suchfilter:</strong> ${alert.query || alert.city || alert.category || "allgemein"}</p>
                </div>

                <p>Wenn du magst, kannst du das Event direkt in GateKeeper ansehen und speichern.</p>
                <p style="margin-top: 30px; font-size: 0.9rem; color: #94a3b8;">Dein GateKeeper Team</p>
            </div>
        `;

        await sendTransactionalMail({
            fromLabel: "GateKeeper Events",
            to: alert.user?.email,
            subject: subjectParts.filter(Boolean).join(" - "),
            html: emailHtml,
        });
    } catch (error) {
        console.error("[Mail-Service] Fehler beim Senden der Event-Alert-Mail:", error);
        throw error;
    }
}
