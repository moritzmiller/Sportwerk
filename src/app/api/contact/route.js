import { sendContactRequestEmail } from "@/lib/mail";
import {
    isBotTrapTriggered,
    isValidEmail,
    normalizeEmail,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

const VALID_TOPICS = new Set([
    "general",
    "booking",
    "organizer",
    "technical",
    "privacy",
    "legal",
]);

export async function POST(request) {
    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    if (isBotTrapTriggered(body)) {
        return Response.json({ ok: true });
    }

    const name = normalizeSafeText(body.name, { maxLength: 120 });
    const email = normalizeEmail(body.email);
    const topic = normalizeSafeText(body.topic, { maxLength: 40 });
    const bookingNumber = normalizeSafeText(body.bookingNumber, { maxLength: 120 });
    const message = normalizeSafeText(body.message, { maxLength: 4000 });

    if (name.length < 2) {
        return Response.json({ error: "Bitte gib deinen Namen ein." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
        return Response.json({ error: "Bitte gib eine gültige E-Mail-Adresse ein." }, { status: 400 });
    }

    if (!VALID_TOPICS.has(topic)) {
        return Response.json({ error: "Bitte wähle ein gültiges Anliegen aus." }, { status: 400 });
    }

    if (message.length < 10) {
        return Response.json({ error: "Bitte beschreibe deine Anfrage etwas genauer." }, { status: 400 });
    }

    try {
        const mail = await sendContactRequestEmail({
            name,
            email,
            topic,
            bookingNumber: topic === "booking" ? bookingNumber : "",
            message,
        });

        return Response.json({ ok: true, provider: mail.provider });
    } catch (error) {
        console.error("[Contact] Anfrage konnte nicht gesendet werden:", error);
        return Response.json(
            { error: "Die Anfrage konnte nicht gesendet werden. Bitte versuche es später erneut." },
            { status: 500 }
        );
    }
}
