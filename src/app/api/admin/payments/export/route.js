import {
    buildAdminPaymentsCsv,
    filterAdminPayments,
    getAdminPaymentQueryWhere,
    normalizeAdminPaymentStatus,
    normalizeAdminPaymentView,
} from "@/lib/admin-payments";
import { getCurrentUser } from "@/lib/auth";
import { serializeBooking } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";

function buildFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `gatekeeper-payments-${stamp}.csv`;
}

export async function GET(request) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
        return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";
    const view = normalizeAdminPaymentView(url.searchParams.get("view") ?? "all");
    const status = normalizeAdminPaymentStatus(url.searchParams.get("status") ?? "open");

    const rawBookings = await prisma.booking.findMany({
        where: getAdminPaymentQueryWhere(status),
        orderBy: { createdAt: "asc" },
        include: {
            event: {
                select: {
                    id: true,
                    title: true,
                    location: true,
                    city: true,
                    startDate: true,
                },
            },
        },
    });

    const bookings = rawBookings.map(serializeBooking);
    const filtered = filterAdminPayments(bookings, { search, view, status });
    const csv = buildAdminPaymentsCsv(filtered);

    return new Response(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${buildFilename()}"`,
        },
    });
}
