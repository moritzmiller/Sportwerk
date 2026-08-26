import { getCurrentUser } from "@/lib/auth";
import { hasCrmCustomerAccess, normalizeCustomerEmail } from "@/lib/crm";
import { prisma } from "@/lib/prisma";

function jsonError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

export async function POST(request, { params }) {
    const user = await getCurrentUser();
    if (!user) return jsonError("Bitte zuerst anmelden.", 401);
    if (user.role === "VISITOR") return jsonError("Nur Veranstalter können CRM-Daten pflegen.", 403);

    const resolvedParams = await params;
    const email = normalizeCustomerEmail(decodeURIComponent(resolvedParams.email ?? ""));
    const body = await request.json().catch(() => ({}));
    const content = String(body.content ?? "").trim();

    if (!email) return jsonError("Kunden-E-Mail fehlt.");
    if (!content) return jsonError("Eine Notiz ist erforderlich.");

    if (!(await hasCrmCustomerAccess(prisma, user, email))) {
        return jsonError("Kontakt nicht gefunden.", 404);
    }

    const note = await prisma.customerNote.create({
        data: {
            organizerId: user.id,
            customerEmail: email,
            content,
        },
    });

    return Response.json({ ok: true, note });
}
