import { prisma } from "@/lib/prisma";
import { verifyPayPalWebhookSignature } from "@/lib/paypal";
import { processPayPalWebhookEvent } from "@/lib/paypal-webhooks";
import { logSystemEvent } from "@/lib/system-events";

export async function POST(request) {
    const bodyText = await request.text();
    let event;

    try {
        event = JSON.parse(bodyText);
    } catch {
        return Response.json({ error: "Invalid PayPal webhook payload." }, { status: 400 });
    }

    let verified = false;
    try {
        verified = await verifyPayPalWebhookSignature({
            headers: request.headers,
            event,
        });
    } catch (error) {
        console.error("[PayPal webhook] Verification failed:", error?.message || "verification error");
        await logSystemEvent({
            area: "paypal",
            message: "PayPal webhook verification failed.",
            details: error,
        });
        return Response.json({ error: "PayPal webhook verification is not configured." }, { status: 503 });
    }

    if (!verified) {
        return Response.json({ error: "Invalid PayPal webhook signature." }, { status: 401 });
    }

    try {
        const result = await prisma.$transaction((tx) => processPayPalWebhookEvent(tx, event));
        return Response.json({ ok: true, result });
    } catch (error) {
        console.error("[PayPal webhook] Processing failed:", error?.message || "processing error");
        await logSystemEvent({
            area: "paypal",
            message: "PayPal webhook processing failed.",
            details: error,
        });
        return Response.json({ error: "PayPal webhook could not be processed." }, { status: 500 });
    }
}
