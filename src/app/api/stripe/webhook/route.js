import { processStripeWebhookEvent as processErichStripeWebhookEvent } from "@/lib/erich/stripe-webhooks";
import { fulfillPaidErichRegistrationBatch } from "@/lib/erich/documents";
import { sendTicketEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { constructStripeWebhookEvent } from "@/lib/stripe";
import { processStripeWebhookEvent as processBookingStripeWebhookEvent } from "@/lib/stripe-webhooks";
import { logSystemEvent } from "@/lib/system-events";

function isErichStripeEvent(event) {
    const metadata = event?.data?.object?.metadata ?? {};
    return Boolean(metadata.registrationBatchId || metadata.paymentId);
}

export async function POST(request) {
    const bodyText = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return Response.json({ error: "Missing Stripe webhook signature." }, { status: 400 });
    }

    let event;
    try {
        event = constructStripeWebhookEvent(bodyText, signature);
    } catch (error) {
        console.error("[Stripe webhook] Verification failed:", error?.message || "verification error");
        await logSystemEvent({
            area: "stripe",
            message: "Stripe webhook verification failed.",
            details: error,
        });
        return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 401 });
    }

    try {
        if (isErichStripeEvent(event)) {
            const result = await prisma.$transaction((tx) => processErichStripeWebhookEvent(tx, event));
            if ((result.action === "paid" || result.action === "already-paid") && result.registrationBatchId) {
                await fulfillPaidErichRegistrationBatch(prisma, {
                    batchId: result.registrationBatchId,
                    actorId: result.payment?.accountId ?? null,
                    origin: request.nextUrl.origin,
                }).catch((error) => {
                    console.error("[ERICH] Stripe webhook fulfillment failed:", error);
                });
            }
            return Response.json({ ok: true, result });
        }

        const result = await prisma.$transaction((tx) => processBookingStripeWebhookEvent(tx, event));
        if (result.action === "paid" && result.bookingId) {
            const booking = await prisma.booking.findUnique({
                where: { id: result.bookingId },
                include: { event: true },
            });
            if (booking) {
                sendTicketEmail(booking).catch((error) => {
                    console.error("[Stripe webhook] Ticket mail failed:", error);
                });
            }
        }

        return Response.json({ ok: true, result });
    } catch (error) {
        console.error("[Stripe webhook] Processing failed:", error?.message || "processing error");
        await logSystemEvent({
            area: "stripe",
            message: "Stripe webhook processing failed.",
            details: error,
        });
        return Response.json({ error: "Stripe webhook could not be processed." }, { status: 500 });
    }
}
