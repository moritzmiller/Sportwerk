import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function jsonError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

export async function PATCH(request, { params }) {
    const user = await getCurrentUser();
    if (!user) return jsonError("Bitte zuerst anmelden.", 401);
    if (user.role === "VISITOR") return jsonError("Nur Veranstalter können CRM-Daten pflegen.", 403);

    const resolvedParams = await params;
    const taskId = String(resolvedParams.taskId ?? "").trim();
    const body = await request.json().catch(() => ({}));
    const completed = Boolean(body.completed);

    if (!taskId) return jsonError("Aufgabe fehlt.");

    const result = await prisma.customerTask.updateMany({
        where: { id: taskId, organizerId: user.id },
        data: { completedAt: completed ? new Date() : null },
    });

    if (result.count === 0) {
        return jsonError("Aufgabe nicht gefunden.", 404);
    }

    const task = await prisma.customerTask.findUnique({
        where: { id: taskId },
    });

    return Response.json({ ok: true, task });
}
