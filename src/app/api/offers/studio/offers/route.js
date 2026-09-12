import {
    jsonError,
    nextOfferNumber,
    normalizeOfferPayload,
    readOfferStudioBody,
    requireOfferStudioUser,
    resolveOfferCustomerId,
    toClientOffer,
} from "@/lib/offer-studio";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
    const { user, response } = await requireOfferStudioUser();
    if (response) return response;

    const bodyResult = await readOfferStudioBody(request);
    if (bodyResult.response) return bodyResult.response;

    const payload = normalizeOfferPayload(bodyResult.offer, bodyResult.items, bodyResult.totals);
    if (!payload.offer.title) return jsonError("Bitte einen Angebotstitel eintragen.");

    const existingOffer = payload.offer.id
        ? await prisma.offer.findFirst({
              where: { id: payload.offer.id, ownerId: user.id },
              select: { id: true, number: true, createdAt: true },
          })
        : null;

    const customerId = await resolveOfferCustomerId(user.id, payload.customer);
    const offerNumber = payload.offer.number || (await nextOfferNumber(user.id));

    const savedOffer = await prisma.$transaction(async (tx) => {
        await tx.offerCompanyProfile.upsert({
            where: { ownerId: user.id },
            create: {
                ownerId: user.id,
                ...payload.company,
            },
            update: payload.company,
        });

        const offer = existingOffer
            ? await tx.offer.update({
                  where: { id: existingOffer.id },
                  data: {
                      ...payload.offer,
                      id: undefined,
                      number: offerNumber,
                      customerId,
                  },
              })
            : await tx.offer.create({
                  data: {
                      ...payload.offer,
                      id: undefined,
                      ownerId: user.id,
                      number: offerNumber,
                      customerId,
                  },
              });

        await tx.offerItem.deleteMany({ where: { offerId: offer.id } });
        if (payload.items.length > 0) {
            await tx.offerItem.createMany({
                data: payload.items.map((item) => ({
                    ...item,
                    id: undefined,
                    offerId: offer.id,
                })),
            });
        }

        return tx.offer.findUnique({
            where: { id: offer.id },
            include: { items: true },
        });
    });

    return Response.json({ ok: true, offer: toClientOffer(savedOffer) });
}
