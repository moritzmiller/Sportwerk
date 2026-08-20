import { prisma } from "@/lib/prisma";
import { createMollieAdapter } from "@/lib/payments/mollie";
import { processMolliePaymentStatus } from "@/lib/mollie-webhooks";
import { logSystemEvent } from "@/lib/system-events";

async function readMollieWebhookId(request) {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        const body = await request.json().catch(() => null);
        return body?.id ?? body?.paymentId ?? null;
    }

    const text = await request.text();
    const params = new URLSearchParams(text);
    return params.get("id") || params.get("paymentId") || text.trim() || null;
}

export async function POST(request) {
    const paymentId = await readMollieWebhookId(request);

    if (!paymentId) {
        return Response.json({ error: "Missing Mollie payment id." }, { status: 400 });
    }

    try {
        const adapter = createMollieAdapter();
        const payment = await adapter.getPaymentStatus({ providerPaymentId: paymentId });
        const result = await prisma.$transaction((tx) => processMolliePaymentStatus(tx, payment));

        return Response.json({ ok: true, result });
    } catch (error) {
        console.error("[Mollie webhook] Processing failed:", error?.message || "processing error");
        await logSystemEvent({
            area: "mollie",
            message: "Mollie webhook processing failed.",
            details: error,
        });
        return Response.json({ error: "Mollie webhook could not be processed." }, { status: 500 });
    }
}
