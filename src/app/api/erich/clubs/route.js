import { prisma } from "@/lib/prisma";
import { normalizeSafeText } from "@/lib/security";

function clubSelect() {
    return {
        id: true,
        officialName: true,
        externalFederationId: true,
        countryCode: true,
        federalState: true,
        stateRowingAssociation: true,
        isGermanClub: true,
        isCentralGermanClub: true,
        stateAssociationMember: true,
    };
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = normalizeSafeText(searchParams.get("q"), { maxLength: 120 }).toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean).slice(0, 6);

    if (terms.length === 0) {
        return Response.json({ clubs: [] });
    }

    const clubs = await prisma.erichClub.findMany({
        where: {
            active: true,
            AND: terms.map((term) => ({ searchText: { contains: term } })),
        },
        orderBy: { officialName: "asc" },
        select: clubSelect(),
        take: 25,
    });

    return Response.json({ clubs });
}
