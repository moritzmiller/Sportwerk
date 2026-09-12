import { jsonError, requireOfferStudioUser } from "@/lib/offer-studio";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request, { params }) {
    const { user, response } = await requireOfferStudioUser();
    if (response) return response;

    const { id } = await params;
    const offer = await prisma.offer.findFirst({
        where: { id, ownerId: user.id },
        select: { id: true },
    });

    if (!offer) return jsonError("Angebot nicht gefunden.", 404);

    await prisma.offer.delete({ where: { id } });
    return Response.json({ ok: true });
}
