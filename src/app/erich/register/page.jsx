import ErichRegistrationWizard from "@/components/ErichRegistrationWizard";
import { getCurrentUserWithErichRoles } from "@/lib/auth";
import { getOptionalErichGuestUser } from "@/lib/erich/guest-session";
import { erichRegistrationBatchInclude } from "@/lib/erich/registration-service";
import { prisma } from "@/lib/prisma";
import {
    getMissingPublicTables,
    isMissingPrismaTableError,
} from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

const ERICH_REGISTRATION_TABLES = [
    "ErichEvent",
    "ErichClub",
    "ErichAthlete",
    "ErichRegistrationBatch",
    "ErichRoleAssignment",
];

function serialize(value) {
    return JSON.parse(JSON.stringify(value));
}

async function loadWizardData(user) {
    const accountWhere = user?.id ? { accountId: user.id } : { id: "" };
    const [events, clubs, athletes, batches] = await Promise.all([
        prisma.erichEvent.findMany({
            where: { status: "ACTIVE" },
            orderBy: { startsAt: "asc" },
            select: {
                id: true,
                name: true,
                slug: true,
                startsAt: true,
                endsAt: true,
                timezone: true,
                status: true,
                pricePhases: {
                    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
                    select: {
                        id: true,
                        name: true,
                        active: true,
                        startsAt: true,
                        endsAt: true,
                        sortOrder: true,
                    },
                },
                raceDefinitions: {
                    where: { status: "ACTIVE" },
                    orderBy: { raceNumber: "asc" },
                    select: {
                        id: true,
                        raceNumber: true,
                        gender: true,
                        classLabel: true,
                        distanceLabel: true,
                        includesErich: true,
                        includesDm: true,
                        includesMdm: true,
                        isLightweight: true,
                        isPara: true,
                        isTeamRace: true,
                        minimumBirthYear: true,
                        maximumBirthYear: true,
                        prices: {
                            select: {
                                valuationLevel: true,
                                amountCents: true,
                                currency: true,
                                pricePhase: {
                                    select: {
                                        name: true,
                                        active: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }),
        Promise.resolve([]),
        prisma.erichAthlete.findMany({
            where: accountWhere,
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            include: {
                club: {
                    select: {
                        id: true,
                        officialName: true,
                        countryCode: true,
                        externalFederationId: true,
                        federalState: true,
                        stateRowingAssociation: true,
                    },
                },
            },
        }),
        prisma.erichRegistrationBatch.findMany({
            where: accountWhere,
            include: erichRegistrationBatchInclude(),
            orderBy: { createdAt: "desc" },
        }),
    ]);

    return serialize({ events, clubs, athletes, batches });
}

function ErichSetupRequired({ missingTables = [] }) {
    return (
        <main className="erich-page">
            <div className="erich-container">
                <div className="erich-page__header">
                    <div>
                        <span className="erich-eyebrow">ERICH Setup</span>
                        <h1>Datenbank-Migration ausstehend</h1>
                        <p>
                            Die ERICH-Tabellen fehlen in der lokalen Datenbank. Fuehre im
                            Ordner <code>gatekeeper</code> zuerst{" "}
                            <code>npx prisma migrate dev</code> aus und starte danach den
                            Dev-Server neu.
                        </p>
                        {missingTables.length > 0 ? (
                            <p>
                                Fehlend: <code>{missingTables.join(", ")}</code>
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        </main>
    );
}

export default async function ErichRegisterPage() {
    const authenticatedUser = await getCurrentUserWithErichRoles();
    const guestUser = authenticatedUser ? null : await getOptionalErichGuestUser(prisma);
    const user = authenticatedUser ?? guestUser;

    const missingTables = await getMissingPublicTables(prisma, ERICH_REGISTRATION_TABLES);

    if (missingTables.length > 0) {
        return <ErichSetupRequired missingTables={missingTables} />;
    }

    let data;

    try {
        data = await loadWizardData(user);
    } catch (error) {
        if (!isMissingPrismaTableError(error)) {
            throw error;
        }

        return <ErichSetupRequired />;
    }

    return (
        <main className="erich-page">
            <div className="erich-container">
                <div className="erich-page__header">
                    <div className={"erich-subheader"}>
                        <span className="erich-eyebrow">ERICH Registrierung</span>
                        <h1>Anmeldung</h1>
                        <p>
                            Athlet anlegen, Rennen auswaehlen, Zielzeit eintragen und die
                            Anmeldung abschliessen.
                        </p>
                    </div>
                    <div className="erich-page__status" aria-label="Registrierungsstatus">
                        <span>15 min Draft-Fenster</span>
                        <strong>{data.events.length} aktive Events</strong>
                    </div>
                </div>

                <ErichRegistrationWizard
                    initialEvents={data.events}
                    initialClubs={data.clubs}
                    initialAthletes={data.athletes}
                    initialBatches={data.batches}
                    isGuest={!authenticatedUser}
                />
            </div>
        </main>
    );
}
