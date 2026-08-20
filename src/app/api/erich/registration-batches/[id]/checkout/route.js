import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { startRegistrationCheckout } from "@/lib/erich/registration-service";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/security";

function jsonError(error) {
    const code = error?.code ?? null;
    const status =
        code === "ERICH_PERMISSION_DENIED"
            ? 403
            : code === "ERICH_PAYPAL_NOT_CONFIGURED"
              ? 503
              : code === "ERICH_STRIPE_NOT_CONFIGURED"
              ? 503
              : String(code ?? "").startsWith("ERICH_")
                ? 400
                : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH checkout could not be started." : error.message,
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
        const result = await startRegistrationCheckout(prisma, {
            user,
            batchId: id,
            provider: body.provider ?? "BANK_TRANSFER",
            origin: new URL(request.url).origin,
        });

        return Response.json({
            ok: true,
            batch: result.batch,
            payment: result.payment,
            paymentAttempt: result.paymentAttempt,
            checkout: result.checkout,
            summary: result.summary,
        });
    } catch (error) {
        console.error("[ERICH] Checkout start failed:", error);
        return jsonError(error);
    }
}
