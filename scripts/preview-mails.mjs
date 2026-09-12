import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
    sendAccountVerificationEmail,
    sendContactRequestEmail,
    sendEventAlertEmail,
    sendManualPaymentEmail,
    sendPasswordResetEmail,
    sendPaymentCancellationEmail,
    sendPaymentReminderEmail,
    sendRegistrationWelcomeEmail,
    sendTicketEmail,
} from "../src/lib/mail.js";

const previewDir = path.join(process.cwd(), ".dev-logs", "mail-previews");
let lastPayload = null;

process.env.NODE_ENV = "development";
process.env.APP_URL = process.env.APP_URL || "https://gatekeeper.example.com";
process.env.EMAIL_PROVIDER = "resend";
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "noreply@gatekeeper.example.com";
process.env.RESEND_API_KEY = "preview-only";
process.env.CONTACT_EMAIL = process.env.CONTACT_EMAIL || "kontakt@gatekeeper.example.com";

globalThis.fetch = async (_url, options) => {
    lastPayload = JSON.parse(options.body);
    return { ok: true };
};

const user = {
    email: "ada@example.com",
    name: "Ada Lovelace",
};

const booking = {
    id: "GK-2026-0042",
    purchaserName: "Ada Lovelace",
    purchaserEmail: "ada@example.com",
    quantity: 2,
    ticketTypeName: "Standard",
    totalAmount: 38,
    event: {
        id: "event-sommernacht",
        title: "Sommernacht im Palais",
        startDate: new Date("2026-09-19T18:30:00.000Z"),
        location: "Palais Sommergarten",
        city: "Dresden",
    },
};

const paymentDetails = {
    paymentMethod: "BANK_TRANSFER",
    paymentReference: "GK-2026-0042",
    dueDate: "26.09.2026",
    accountHolder: "Gatekeeper GmbH",
    iban: "DE00 0000 0000 0000 0000 00",
    bic: "GATEDEFFXXX",
};

async function capture(name, send) {
    lastPayload = null;
    await send();
    if (!lastPayload?.html) {
        throw new Error(`No preview payload captured for ${name}.`);
    }
    const filePath = path.join(previewDir, `${name}.html`);
    await writeFile(filePath, lastPayload.html, "utf8");
    return filePath;
}

await mkdir(previewDir, { recursive: true });

const files = [];
files.push(
    await capture("01-welcome", () => sendRegistrationWelcomeEmail(user)),
    await capture("02-account-verification", () =>
        sendAccountVerificationEmail(user, "https://gatekeeper.example.com/auth/verify?token=preview")
    ),
    await capture("03-password-reset", () =>
        sendPasswordResetEmail(user, "https://gatekeeper.example.com/auth/reset?token=preview")
    ),
    await capture("04-ticket-confirmation", () => sendTicketEmail(booking)),
    await capture("05-manual-payment", () => sendManualPaymentEmail(booking, paymentDetails)),
    await capture("06-payment-reminder", () =>
        sendPaymentReminderEmail(booking, paymentDetails, { reminderCount: 1 })
    ),
    await capture("07-payment-cancellation", () =>
        sendPaymentCancellationEmail(booking, paymentDetails, "Zahlungsfrist abgelaufen")
    ),
    await capture("08-event-alert", () =>
        sendEventAlertEmail(
            { query: "Sommer", city: "Dresden", user },
            booking.event
        )
    ),
    await capture("09-contact-request", () =>
        sendContactRequestEmail({
            topic: "technical",
            name: "Ada Lovelace",
            email: "ada@example.com",
            bookingNumber: booking.id,
            message: "Hallo Gatekeeper-Team,\nich brauche Hilfe mit meiner Buchung.",
        })
    )
);

console.log("Mail previews written:");
for (const file of files) {
    console.log(`- ${file}`);
}
