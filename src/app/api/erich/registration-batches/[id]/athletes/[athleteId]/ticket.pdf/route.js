import {
    buildErichAthleteTicketFilename,
    generateErichAthleteTicketPdf,
    loadErichAthleteTicketDocument,
} from "@/lib/erich/documents";
import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { prisma } from "@/lib/prisma";

function pdfError(error) {
    const code = error?.code ?? null;
    const status =
        code === "ERICH_REGISTRATION_BATCH_NOT_FOUND" || code === "ERICH_ATHLETE_DOCUMENT_NOT_FOUND"
            ? 404
            : String(code ?? "").startsWith("ERICH_")
              ? 400
              : 500;

    return Response.json(
        {
            error: status === 500 ? "ERICH ticket document could not be generated." : error.message,
            code,
        },
        { status }
    );
}

export async function GET(_request, { params }) {
    const { user } = await getCurrentErichUserOrGuest();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    try {
        const { id, athleteId } = await params;
        const documentData = await loadErichAthleteTicketDocument(prisma, {
            user,
            batchId: id,
            athleteId,
        });
        const pdf = await generateErichAthleteTicketPdf(documentData);
        const filename = buildErichAthleteTicketFilename(documentData);

        return new Response(pdf, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${filename}"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        console.error("[ERICH] Ticket PDF generation failed:", error);
        return pdfError(error);
    }
}
