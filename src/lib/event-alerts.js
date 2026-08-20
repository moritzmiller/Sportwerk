import { sendEventAlertEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
}

export function matchesEventAlert(alert, event) {
    if (!alert?.active) return false;

    const query = normalize(alert.query);
    const city = normalize(alert.city);
    const category = normalize(alert.category);
    const title = normalize(event.title);
    const location = normalize(event.location);
    const eventCity = normalize(event.city);
    const eventCategory = normalize(event.category);

    if (alert.eventId && alert.eventId === event.id) return true;

    const queryMatch =
        !query || title.includes(query) || location.includes(query) || eventCity.includes(query);
    const cityMatch = !city || eventCity === city;
    const categoryMatch = !category || eventCategory === category;

    return queryMatch && cityMatch && categoryMatch;
}

export async function notifyMatchingAlerts(event, actorId = null) {
    if (event.status !== "PUBLISHED") return { sent: 0 };
    if (!prisma.eventAlert?.findMany || !prisma.eventAuditLog?.createMany) {
        return { sent: 0 };
    }

    const alerts = await prisma.eventAlert.findMany({
        where: {
            active: true,
        },
        include: {
            user: true,
        },
    });

    const matching = alerts.filter((alert) => matchesEventAlert(alert, event));

    for (const alert of matching) {
        await sendEventAlertEmail(alert, event);
    }

    if (matching.length > 0) {
        await prisma.eventAuditLog.createMany({
            data: matching.map((alert) => ({
                eventId: event.id,
                actorId,
                action: "event.alert.sent",
                details: {
                    alertId: alert.id,
                    userId: alert.userId,
                },
            })),
        });
    }

    return { sent: matching.length };
}
