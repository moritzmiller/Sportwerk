import { redirect } from "next/navigation";

import VenueManager from "@/components/VenueManager";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const organizations = await prisma.organization.findMany({
        where:
            user.role === "ADMIN"
                ? {}
                : {
                      OR: [
                          { ownerId: user.id },
                          { members: { some: { userId: user.id } } },
                      ],
                  },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
            events: {
                select: {
                    id: true,
                    title: true,
                    startDate: true,
                    status: true,
                    venueId: true,
                },
            },
            venues: {
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    city: true,
                    notes: true,
                    organizationId: true,
                    events: {
                        select: {
                            id: true,
                            title: true,
                            startDate: true,
                            status: true,
                            venueId: true,
                        },
                    },
                },
            },
        },
    });

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Venues</span>
                        <h1 className="section-header__title">Orte und Spielstätten</h1>
                        <p className="text-muted">
                            Verwalte alle Venues zentral, bearbeite Details und ordne Events direkt zu.
                        </p>
                    </div>
                </div>

                <VenueManager initialOrganizations={organizations} />
            </div>
        </main>
    );
}
