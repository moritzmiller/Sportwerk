import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSafeUserQueryConfig, normalizeExistingUser, selectExistingUserFields } from "@/lib/user-schema";
import { normalizePaymentMethod } from "@/lib/payment-methods";

function normalizeText(value) {
    return String(value ?? "").trim();
}

export async function PATCH(request) {
    const user = await getCurrentUser();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { select } = await getSafeUserQueryConfig();

    const payload = await selectExistingUserFields({
        name: normalizeText(body.name) || null,
        paypalEmail: normalizeText(body.paypalEmail) || null,
        billingName: normalizeText(body.billingName) || null,
        billingStreet: normalizeText(body.billingStreet) || null,
        billingStreet2: normalizeText(body.billingStreet2) || null,
        billingPostalCode: normalizeText(body.billingPostalCode) || null,
        billingCity: normalizeText(body.billingCity) || null,
        billingCountry: (normalizeText(body.billingCountry) || "DE").toUpperCase(),
        preferredPaymentMethod: normalizePaymentMethod(
            body.preferredPaymentMethod,
            user.preferredPaymentMethod || "STRIPE"
        ),
    });

    const result = await prisma.user.updateMany({
        where: { id: user.id },
        data: payload,
    });

    if (result.count === 0) {
        return Response.json({ error: "Profil nicht gefunden." }, { status: 404 });
    }

    const updated = await prisma.user.findUnique({
        where: { id: user.id },
        select,
    });

    return Response.json({
        ok: true,
        user: await normalizeExistingUser(updated),
    });
}
