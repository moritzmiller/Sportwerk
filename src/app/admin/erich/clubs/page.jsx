import Link from "next/link";
import { redirect } from "next/navigation";

import ErichClubManager from "@/components/ErichClubManager";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "ERICH Clubs - GateKeeper Admin",
};

function serialize(value) {
    return JSON.parse(JSON.stringify(value));
}

export default async function AdminErichClubsPage({ searchParams }) {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role !== "ADMIN") redirect("/dashboard");

    const resolvedSearchParams = await searchParams;
    const query = String(resolvedSearchParams?.q ?? "").trim().toLowerCase();

    const [clubs, events] = await Promise.all([
        prisma.erichClub.findMany({
            where: query ? { searchText: { contains: query } } : {},
            orderBy: [{ active: "desc" }, { officialName: "asc" }],
            take: 250,
        }),
        prisma.erichEvent.findMany({
            orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                name: true,
                status: true,
            },
        }),
    ]);

    const activeCount = clubs.filter((club) => club.active).length;
    const germanCount = clubs.filter((club) => club.isGermanClub).length;
    const mdmCount = clubs.filter((club) => club.isCentralGermanClub).length;
    const lrvCount = clubs.filter((club) => club.stateAssociationMember).length;

    return (
        <main className="admin-shell">
            <section className="admin-hero">
                <div className="container admin-hero__inner">
                    <div className="admin-hero__copy">
                        <span className="eyebrow">ERICH Admin</span>
                        <h1>Club Master Data</h1>
                        <p>
                            Vereine pflegen, DM/MDM-Zugehörigkeit sauber halten und den
                            Registrierungswizard mit nutzbaren Clubdaten versorgen.
                        </p>
                        <div className="admin-hero__meta">
                            <span>{activeCount} aktive Clubs</span>
                            <span>{events.length} ERICH Events</span>
                        </div>
                    </div>
                    <div className="admin-hero__actions">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurück
                        </Link>
                        <Link href="/admin/erich/races" className="btn btn-primary">
                            Rennen prüfen
                        </Link>
                    </div>
                </div>
            </section>

            <div className="container admin-dashboard">
                <section className="admin-metrics" aria-label="ERICH Club Kennzahlen">
                    <div className="admin-metric">
                        <span className="admin-metric__label">Aktiv</span>
                        <strong>{activeCount}</strong>
                        <span>im Wizard auswählbar</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Deutsch</span>
                        <strong>{germanCount}</strong>
                        <span>DM-relevant</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Mitteldeutsch</span>
                        <strong>{mdmCount}</strong>
                        <span>MDM-relevant</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">LRV</span>
                        <strong>{lrvCount}</strong>
                        <span>mit Landesverbandsmitgliedschaft</span>
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Suche</span>
                            <h2>Club finden</h2>
                        </div>
                    </div>
                    <form className="system-diagnostics-form" action="/admin/erich/clubs" method="get">
                        <input
                            className="input"
                            name="q"
                            defaultValue={query}
                            placeholder="Name, Land, Bundesland oder Verbands-ID"
                        />
                        <button className="btn btn-primary" type="submit">
                            Suchen
                        </button>
                        {query ? (
                            <Link href="/admin/erich/clubs" className="btn btn-ghost">
                                Zurücksetzen
                            </Link>
                        ) : null}
                    </form>
                </section>

                <ErichClubManager clubs={serialize(clubs)} events={serialize(events)} />
            </div>
        </main>
    );
}
