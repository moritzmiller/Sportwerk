import Link from "next/link";
import { redirect } from "next/navigation";

import SystemEventResolveButton from "@/components/SystemEventResolveButton";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthDiagnostics } from "@/lib/auth-diagnostics";
import { prisma } from "@/lib/prisma";
import { buildSystemStatus } from "@/lib/system-status";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Systemstatus - GateKeeper",
};

function statusLabel(status) {
    if (status === "ok") return "OK";
    if (status === "warning") return "Warnung";
    return "Fehler";
}

function statusClass(status) {
    if (status === "ok") return "admin-status admin-status--ok";
    if (status === "warning") return "admin-status admin-status--warning";
    return "admin-status admin-status--error";
}

function formatDateTime(value) {
    if (!value) return "Unbekannt";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

export default async function AdminSystemPage({ searchParams }) {
    const resolvedSearchParams = await searchParams;
    const authEmail = String(resolvedSearchParams?.authEmail ?? "").trim();
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role !== "ADMIN") redirect("/dashboard");

    const [system, authDiagnostics, recentSystemEvents] = await Promise.all([
        Promise.resolve(buildSystemStatus()),
        buildAuthDiagnostics({ email: authEmail }),
        prisma.systemEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 12,
        }),
    ]);

    return (
        <main className="admin-shell">
            <section className="admin-hero">
                <div className="container admin-hero__inner">
                    <div className="admin-hero__copy">
                        <span className="eyebrow">Admin</span>
                        <h1>Systemstatus</h1>
                        <p>
                            Konfigurationsstatus für Deployment, Auth, Zahlungen, Mail,
                            Datenbank und Sicherheitswerte.
                        </p>
                        <div className="admin-hero__meta">
                            <span>NODE_ENV={system.nodeEnv}</span>
                            <span>{system.production ? "Production" : "Development"}</span>
                        </div>
                    </div>
                    <div className="admin-hero__actions">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurück zum Admin
                        </Link>
                    </div>
                </div>
            </section>

            <div className="container admin-dashboard">
                <section className="admin-metrics" aria-label="System Kennzahlen">
                    <div className={system.counts.error > 0 ? "admin-metric admin-metric--attention" : "admin-metric"}>
                        <span className="admin-metric__label">Fehler</span>
                        <strong>{system.counts.error}</strong>
                        <span>Produktionskritische Konfigurationen</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Warnungen</span>
                        <strong>{system.counts.warning}</strong>
                        <span>Prüfbare Risiken oder lokale Fallbacks</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">OK</span>
                        <strong>{system.counts.ok}</strong>
                        <span>Gültige Systembereiche</span>
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Konfiguration</span>
                            <h2>Öffentliche Systemzusammenfassung</h2>
                        </div>
                        <span className={statusClass(system.ok ? "ok" : "error")}>
                            {system.ok ? "Startbereit" : "Eingriff nötig"}
                        </span>
                    </div>
                    <div className="system-summary-grid">
                        <div>
                            <span>App URL</span>
                            <strong>{system.summary.appUrl}</strong>
                        </div>
                        <div>
                            <span>Supabase</span>
                            <strong>{system.summary.supabase}</strong>
                        </div>
                        <div>
                            <span>PayPal</span>
                            <strong>{system.summary.paypal}</strong>
                        </div>
                        <div>
                            <span>PayPal Webhook</span>
                            <strong>{system.summary.paypalWebhook}</strong>
                        </div>
                        <div>
                            <span>Mail</span>
                            <strong>{system.summary.mail}</strong>
                        </div>
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Checks</span>
                            <h2>Systembereiche</h2>
                        </div>
                        <span className="admin-panel__count">{system.checks.length} Prüfungen</span>
                    </div>
                    <div className="admin-list">
                        {system.checks.map((check) => (
                            <article key={check.id} className="admin-list-row system-check-row">
                                <div className="admin-list-row__main">
                                    <strong>{check.label}</strong>
                                    <span>{check.message}</span>
                                    {check.issues.length > 0 ? (
                                        <ul className="system-check-row__issues">
                                            {check.issues.map((issue) => (
                                                <li key={issue}>{issue}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                                <div className="admin-list-row__aside">
                                    <span className={statusClass(check.status)}>
                                        {statusLabel(check.status)}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Deployment</span>
                            <h2>CLI-Prüfung</h2>
                        </div>
                    </div>
                    <p className="text-muted">
                        Für Netzwerkproben und CI/CD weiterhin lokal oder im Deployment ausführen:
                    </p>
                    <code className="system-command">npm run check:system</code>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Auth</span>
                            <h2>Login-Diagnose</h2>
                        </div>
                        <span className={statusClass(authDiagnostics.ok ? "ok" : "error")}>
                            {authDiagnostics.ok ? "Unauffällig" : "Prüfen"}
                        </span>
                    </div>
                    <form className="system-diagnostics-form" action="/admin/system" method="get">
                        <label htmlFor="authEmail">Account per E-Mail prüfen</label>
                        <div>
                            <input
                                id="authEmail"
                                name="authEmail"
                                type="email"
                                placeholder="name@example.com"
                                defaultValue={authEmail}
                            />
                            <button className="btn btn-primary" type="submit">
                                Prüfen
                            </button>
                        </div>
                    </form>
                    <div className="admin-list">
                        {authDiagnostics.checks.map((check) => (
                            <article key={check.id} className="admin-list-row system-check-row">
                                <div className="admin-list-row__main">
                                    <strong>{check.label}</strong>
                                    <span>{check.message}</span>
                                    {check.details.length > 0 ? (
                                        <ul className="system-check-row__issues">
                                            {check.details.map((detail) => (
                                                <li key={detail}>{detail}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                                <div className="admin-list-row__aside">
                                    <span className={statusClass(check.status)}>
                                        {statusLabel(check.status)}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                    {authDiagnostics.account ? (
                        <div className="system-summary-grid system-summary-grid--compact">
                            <div>
                                <span>GateKeeper Rolle</span>
                                <strong>
                                    {authDiagnostics.account.gatekeeperProfile?.role ?? "kein Profil"}
                                </strong>
                            </div>
                            <div>
                                <span>GateKeeper Status</span>
                                <strong>
                                    {authDiagnostics.account.gatekeeperProfile?.disabledAt
                                        ? "deaktiviert"
                                        : authDiagnostics.account.gatekeeperProfile
                                          ? "aktiv"
                                          : "fehlt"}
                                </strong>
                            </div>
                            <div>
                                <span>Supabase bestaetigt</span>
                                <strong>
                                    {authDiagnostics.account.supabaseUser?.confirmedAt ||
                                    authDiagnostics.account.supabaseUser?.emailConfirmedAt
                                        ? "ja"
                                        : authDiagnostics.account.supabaseUser
                                          ? "nein"
                                          : "fehlt"}
                                </strong>
                            </div>
                            <div>
                                <span>Letzter Login</span>
                                <strong>
                                    {authDiagnostics.account.supabaseUser?.lastSignInAt ?? "unbekannt"}
                                </strong>
                            </div>
                        </div>
                    ) : null}
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Operations</span>
                            <h2>Letzte Systemereignisse</h2>
                        </div>
                        <span className="admin-panel__count">{recentSystemEvents.length} Einträge</span>
                    </div>
                    {recentSystemEvents.length === 0 ? (
                        <p className="text-muted">Keine Systemereignisse gespeichert.</p>
                    ) : (
                        <div className="admin-list">
                            {recentSystemEvents.map((event) => (
                                <article key={event.id} className="admin-list-row system-event-row">
                                    <div className="admin-list-row__main">
                                        <strong>{event.message}</strong>
                                        <span>
                                            {event.area} · {formatDateTime(event.createdAt)}
                                            {event.resolvedAt
                                                ? ` · erledigt ${formatDateTime(event.resolvedAt)}`
                                                : ""}
                                        </span>
                                        {event.details ? (
                                            <code>{JSON.stringify(event.details)}</code>
                                        ) : null}
                                    </div>
                                    <div className="admin-list-row__aside">
                                        <span className={statusClass(event.level === "error" ? "error" : event.level === "warning" ? "warning" : "ok")}>
                                            {event.resolvedAt ? "erledigt" : event.level}
                                        </span>
                                        {!event.resolvedAt ? (
                                            <SystemEventResolveButton eventId={event.id} />
                                        ) : null}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
