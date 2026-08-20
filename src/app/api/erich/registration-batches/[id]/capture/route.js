import {
    captureRegistrationPayPalCheckout,
    captureRegistrationStripeCheckout,
} from "@/lib/erich/registration-service";
import { fulfillPaidErichRegistrationBatch } from "@/lib/erich/documents";
import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function jsonError(error) {
    const code = error?.code ?? null;
    const status =
        code === "ERICH_PERMISSION_DENIED"
            ? 403
            : String(code ?? "").startsWith("ERICH_")
              ? 400
              : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH checkout could not be captured." : error.message,
            code,
        },
        { status }
    );
}

export async function POST(request, { params }) {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    let body;
    try {
        body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return response;
        throw error;
    }

    try {
        const { id } = await params;
        const provider = body.provider ?? (body.sessionId || body.stripeSessionId ? "STRIPE" : "PAYPAL");
        const result =
            provider === "STRIPE"
                ? await captureRegistrationStripeCheckout(prisma, {
                      user,
                      batchId: id,
                      sessionId: body.sessionId ?? body.stripeSessionId,
                  })
                : await captureRegistrationPayPalCheckout(prisma, {
                      user,
                      batchId: id,
                      orderId: body.orderId ?? body.token,
                  });

        if (result.batch?.status === "PAID") {
            await fulfillPaidErichRegistrationBatch(prisma, {
                batchId: result.batch.id,
                actorId: user.id,
                origin: request.nextUrl.origin,
            }).catch((error) => {
                console.error("[ERICH] Ticket document fulfillment failed:", error);
            });
        }

        return Response.json({
            ok: true,
            batch: result.batch,
            payment: result.payment,
            paymentAttempt: result.paymentAttempt,
            alreadyPaid: result.alreadyPaid,
        });
    } catch (error) {
        console.error("[ERICH] Payment capture failed:", error);
        return jsonError(error);
    }
}
