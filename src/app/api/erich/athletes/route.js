import { createErichAthlete, deleteErichAthlete, updateErichAthlete } from "@/lib/erich/athletes";
import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { prisma } from "@/lib/prisma";

function athleteSelect() {
    return {
        id: true,
        accountId: true,
        clubId: true,
        firstName: true,
        lastName: true,
        gender: true,
        birthDate: true,
        birthYear: true,
        nationalityCode: true,
        email: true,
        lightweight: true,
        parasport: true,
        germanLicenseNumber: true,
        createdAt: true,
        updatedAt: true,
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
    };
}

function errorStatus(error) {
    if (error?.code === "ERICH_PERMISSION_DENIED") return 403;
    if (String(error?.code ?? "").startsWith("ERICH_")) return 400;
    return 500;
}

function errorMessage(error) {
    if (errorStatus(error) === 500) return "Athlete could not be saved.";
    return error.message;
}

export async function GET() {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ athletes: [] });
    }

    const athletes = await prisma.erichAthlete.findMany({
        where: { accountId: user.id },
        select: athleteSelect(),
        orderBy: [
            { lastName: "asc" },
            { firstName: "asc" },
            { createdAt: "desc" },
        ],
    });

    return Response.json({ athletes });
}

export async function POST(request) {
    const { user } = await getCurrentErichUserOrGuest({ createGuest: true });

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    try {
        const athlete = await createErichAthlete(prisma, {
            user,
            input: body.athlete ?? body,
            accountId: body.accountId ?? user.id,
            eventId: body.eventId ?? null,
            auditReason: body.auditReason,
        });

        const result = await prisma.erichAthlete.findUnique({
            where: { id: athlete.id },
            select: athleteSelect(),
        });

        return Response.json({ ok: true, athlete: result }, { status: 201 });
    } catch (error) {
        console.error("[ERICH] Athlete creation failed:", error);
        return Response.json(
            { error: errorMessage(error), code: error?.code ?? null },
            { status: errorStatus(error) }
        );
    }
}

export async function PUT(request) {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    try {
        const athlete = await updateErichAthlete(prisma, {
            user,
            athleteId: body.athleteId ?? body.id,
            input: body.athlete ?? body,
            eventId: body.eventId ?? null,
            auditReason: body.auditReason,
        });

        const result = await prisma.erichAthlete.findUnique({
            where: { id: athlete.id },
            select: athleteSelect(),
        });

        return Response.json({ ok: true, athlete: result });
    } catch (error) {
        console.error("[ERICH] Athlete update failed:", error);
        return Response.json(
            { error: errorMessage(error), code: error?.code ?? null },
            { status: errorStatus(error) }
        );
    }
}

export async function DELETE(request) {
    const { user } = await getCurrentErichUserOrGuest();

    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    try {
        const result = await deleteErichAthlete(prisma, {
            user,
            athleteId: body.athleteId ?? body.id,
            eventId: body.eventId ?? null,
            auditReason: body.auditReason,
        });

        return Response.json({
            ok: true,
            athleteId: result.athlete.id,
            deletedConsentAcceptanceCount: result.deletedConsentAcceptanceCount,
        });
    } catch (error) {
        console.error("[ERICH] Athlete deletion failed:", error);
        return Response.json(
            { error: errorMessage(error), code: error?.code ?? null },
            { status: errorStatus(error) }
        );
    }
}
