import Link from "next/link";
import { redirect } from "next/navigation";

import AdminOrganizerManager from "@/components/AdminOrganizerManager";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Veranstalter verwalten - GateKeeper",
};

function serializeOrganizer(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        disabledAt: user.disabledAt?.toISOString?.() ?? user.disabledAt ?? null,
        createdAt: user.createdAt.toISOString(),
        events: user._count.events,
        organizations: user._count.organizations,
        venues: user._count.venues,
    };
}

export default async function AdminOrganizersPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role !== "ADMIN") redirect("/dashboard");

    const organizers = await prisma.user.findMany({
        where: { role: "ORGANIZER" },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            disabledAt: true,
            createdAt: true,
            _count: {
                select: {
                    events: true,
                    organizations: true,
                    venues: true,
                },
            },
        },
    });

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Admin</span>
                        <h1 className="section-header__title">Veranstalter verwalten</h1>
                        <p className="text-muted">
                            Erstelle Veranstalterzugaenge, aendere Namen und deaktiviere Accounts ohne Datenverlust.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurück zum Admin
                        </Link>
                    </div>
                </div>

                <AdminOrganizerManager organizers={organizers.map(serializeOrganizer)} />
            </div>
        </main>
    );
}
