import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { getOptionalCurrentUser } from "@/lib/auth";

export default async function Nav() {
    const user = await getOptionalCurrentUser();
    const isOrganizer = user && user.role !== "VISITOR";

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
                    {user ? (
                        <>
                            <li>
                                <Link href="/dashboard" className="nav__link">
                                    Dashboard
                                </Link>
                            </li>
                            {isOrganizer ? (
                                <li>
                                    <Link href="/dashboard/check-in" className="nav__link">
                                        Check-in
                                    </Link>
                                </li>
                            ) : null}
                            <li>
                                <Link
                                    href={
                                        isOrganizer
                                            ? "/dashboard/bookings"
                                            : "/dashboard/orders"
                                    }
                                    className="nav__link"
                                >
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
