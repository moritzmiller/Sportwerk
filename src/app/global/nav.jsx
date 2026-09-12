import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { getOptionalCurrentUser } from "@/lib/auth";

export default async function Nav() {
    const user = await getOptionalCurrentUser();
    const canUseOffers = user?.role === "ORGANIZER" || user?.role === "ADMIN";

    return (
        <nav className="nav">
            <div className="container nav__inner">
                <Link href="/" className="nav__brand">
                    GateKeeper
                </Link>

                <ul className="nav__links">
                    <li>
                        <Link href="/" className="nav__link">
                            Events
                        </Link>
                    </li>
                    <li>
                        <Link href="/cities" className="nav__link">
                            Städte
                        </Link>
                    </li>
                    <li>
                        <Link href="/venues" className="nav__link">
                            Venues
                        </Link>
                    </li>
                    {canUseOffers ? (
                        <li>
                            <Link href="/angebote" className="nav__link">
                                Angebote
                            </Link>
                        </li>
                    ) : null}
                    {user ? (
                        <li>
                            <Link href="/erich/register" className="nav__link">
                                ERICH
                            </Link>
                        </li>
                    ) : null}
                    {user ? (
                        <>
                            <li>
                                <Link href="/dashboard" className="nav__link">
                                    Dashboard
                                </Link>
                            </li>
                            <li>
                                <Link href="/dashboard/profile" className="nav__link">
                                    Profil
                                </Link>
                            </li>
                            <li>
                                <Link href="/dashboard/orders" className="nav__link">
                                    Bestellungen
                                </Link>
                            </li>
                            <li>
                                <LogoutButton />
                            </li>
                        </>
                    ) : (
                        <li>
                            <Link href="/auth" className="btn btn-primary">
                                Anmelden
                            </Link>
                        </li>
                    )}
                </ul>
            </div>
        </nav>
    );
}
