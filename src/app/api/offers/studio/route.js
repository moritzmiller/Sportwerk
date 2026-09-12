import {
    requireOfferStudioUser,
    toClientCompanyProfile,
    toClientCustomer,
    toClientOffer,
} from "@/lib/offer-studio";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const { user, response } = await requireOfferStudioUser();
    if (response) return response;

    const [customers, offers, companyProfile] = await Promise.all([
        prisma.offerCustomer.findMany({
            where: { ownerId: user.id },
            orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        }),
        prisma.offer.findMany({
            where: { ownerId: user.id },
            include: { items: true },
            orderBy: { updatedAt: "desc" },
        }),
        prisma.offerCompanyProfile.findUnique({
            where: { ownerId: user.id },
        }),
    ]);

    return Response.json({
        customers: customers.map(toClientCustomer),
        offers: offers.map(toClientOffer),
        companyProfile: toClientCompanyProfile(companyProfile),
    });
}
