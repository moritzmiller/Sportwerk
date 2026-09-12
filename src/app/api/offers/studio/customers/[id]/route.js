import { jsonError, requireOfferStudioUser } from "@/lib/offer-studio";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request, { params }) {
    const { user, response } = await requireOfferStudioUser();
    if (response) return response;

    const { id } = await params;
    const customer = await prisma.offerCustomer.findFirst({
        where: { id, ownerId: user.id },
        select: { id: true },
    });

    if (!customer) return jsonError("Kunde nicht gefunden.", 404);

    await prisma.offerCustomer.delete({ where: { id } });
    return Response.json({ ok: true });
}
