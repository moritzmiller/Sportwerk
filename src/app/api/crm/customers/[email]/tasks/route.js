import { getCurrentUser } from "@/lib/auth";
import { normalizeCustomerEmail } from "@/lib/crm";
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
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;

    if (!email) return jsonError("Kunden-E-Mail fehlt.");
    if (!title) return jsonError("Ein Aufgabentitel ist erforderlich.");

    const task = await prisma.customerTask.create({
        data: {
            organizerId: user.id,
            customerEmail: email,
            title,
            description: description || null,
            dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
        },
    });

    return Response.json({ ok: true, task });
}
