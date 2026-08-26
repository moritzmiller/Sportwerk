import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { getOptionalCurrentUser } from "@/lib/auth";

export default async function Nav() {
    const user = await getOptionalCurrentUser();
    const isOrganizer = user && user.role !== "VISITOR";

    return (
        <nav className="nav">
            <div className="container nav__inner">
                <Link href={user ? "/dashboard" : "/"} className="nav__brand">
                    GateKeeper
                </Link>

                <ul className="nav__links">
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
                        <>
                            <li>
                                <Link href="/#plattform" className="nav__link">
                                    Plattform
                                </Link>
                            </li>
                            <li>
                                <Link href="/auth" className="btn btn-primary">
                                    Dashboard oeffnen
                                </Link>
                            </li>
                        </>
                    )}
                </ul>
            </div>
        </nav>
    );
}
