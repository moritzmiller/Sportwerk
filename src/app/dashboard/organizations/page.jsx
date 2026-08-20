import Link from "next/link";
import { redirect } from "next/navigation";

import OrganizationManager from "@/components/OrganizationManager";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
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
        include: {
            owner: { select: { id: true, email: true, name: true } },
            members: {
                include: {
                    user: { select: { id: true, email: true, name: true } },
                },
                orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            },
            venues: {
                orderBy: { createdAt: "desc" },
                include: {
                    events: {
                        select: {
                            id: true,
                            title: true,
                            startDate: true,
                            status: true,
                        },
                    },
                },
            },
            events: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    startDate: true,
                },
            },
        },
    });

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Organisationen</span>
                        <h1 className="section-header__title">Teams und Rechte</h1>
                        <p className="text-muted">
                            Verwalte Organisationen, Teammitglieder und Rollen für Events.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/venues" className="btn btn-ghost">
                            Venues
                        </Link>
                        <Link href="/dashboard" className="btn btn-primary">
                            Dashboard
                        </Link>
                    </div>
                </div>

                <OrganizationManager initialOrgs={organizations} />
            </div>
        </main>
    );
}
