import {
    jsonError,
    normalizeCustomerPayload,
    readOfferStudioBody,
    requireOfferStudioUser,
    toClientCustomer,
} from "@/lib/offer-studio";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
    const { user, response } = await requireOfferStudioUser();
    if (response) return response;

    const bodyResult = await readOfferStudioBody(request, 64 * 1024);
    if (bodyResult.response) return bodyResult.response;

    const customer = normalizeCustomerPayload(bodyResult.customer || bodyResult);
    if (!customer.name) return jsonError("Bitte einen Kundennamen eintragen.");

    const savedCustomer = await prisma.offerCustomer.create({
        data: {
            ownerId: user.id,
            ...customer,
        },
    });

    return Response.json({ ok: true, customer: toClientCustomer(savedCustomer) });
}
