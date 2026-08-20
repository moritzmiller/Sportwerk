import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { getRegistrationBatch } from "@/lib/erich/registration-service";
import { prisma } from "@/lib/prisma";
import {
    isValidEmail,
    normalizeEmail,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

export async function POST(request) {
    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return Response.json({ error: "Bitte eine gueltige E-Mail-Adresse eingeben." }, { status: 400 });
    }

    const { user } = await getCurrentErichUserOrGuest();
    const batchId = String(body.batchId ?? "").trim() || null;
    let batch = null;

    if (batchId && user) {
        try {
            batch = await getRegistrationBatch(prisma, { user, batchId });
        } catch {
            return Response.json({ error: "ERICH-Bestellung konnte nicht gefunden werden." }, { status: 404 });
        }
    }

    await prisma.erichEmailMessage.create({
        data: {
            accountId: user?.id ?? null,
            registrationBatchId: batch?.id ?? null,
            templateKey: "newsletter.signup",
            language: "de",
            recipientEmail: email,
            subject: "ERICH Newsletter Anmeldung",
            status: "SUBSCRIBED",
            payload: {
                source: "erich-thank-you",
                eventId: batch?.eventId ?? null,
            },
        },
    });

    return Response.json({ ok: true });
}
