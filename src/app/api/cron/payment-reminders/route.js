import { prisma } from "@/lib/prisma";
import {
    sendPaymentCancellationEmail,
    sendPaymentReminderEmail,
} from "@/lib/mail";
import { getManualPaymentDetails } from "@/lib/manual-payments";
import {
    getPaymentAutoCancelSummary,
    getPaymentReminderState,
} from "@/lib/payment-reminders";
import { getCronSecret } from "@/lib/env";
import { cancelBookingAndRelease } from "@/lib/payment-state";

function isAuthorized(request) {
    const secret = getCronSecret();
    if (!secret) return process.env.NODE_ENV !== "production";

    const headerSecret = request.headers.get("x-cron-secret");
    const authorization = request.headers.get("authorization");
    return headerSecret === secret || authorization === `Bearer ${secret}`;
}

async function runReminderJob() {
    const bookings = await prisma.booking.findMany({
        where: {
            status: "AWAITING_PAYMENT",
            paymentMethod: {
                in: ["INVOICE", "BANK_TRANSFER"],
            },
        },
        include: {
            event: {
                include: {
                    owner: true,
                },
            },
        },
        orderBy: { createdAt: "asc" },
    });

    const autoCancelled = [];
    const dueBookings = [];
    for (const booking of bookings) {
        const state = getPaymentReminderState(booking);
        if (state.isOverdueForCancellation) {
            autoCancelled.push(booking);
        } else if (state.dueForReminder) {
            dueBookings.push(booking);
        }
    }
    const sent = [];

    for (const booking of dueBookings) {
        const reminderState = getPaymentReminderState(booking);
        const updated = await prisma.booking.update({
            where: { id: booking.id },
            data: {
                paymentReminderCount: Number(booking.paymentReminderCount || 0) + 1,
                lastPaymentReminderAt: new Date(),
            },
            include: {
                event: {
                    include: {
                        owner: true,
                    },
                },
            },
        });

        const manualDetails = getManualPaymentDetails({
            booking: updated,
            event: booking.event,
        });

        await sendPaymentReminderEmail(updated, manualDetails, reminderState);
        sent.push(updated.id);
    }

    for (const booking of autoCancelled) {
        const updated = await prisma.$transaction(async (tx) => {
            const current = await tx.booking.findUnique({
                where: { id: booking.id },
            });

            if (current) {
                await cancelBookingAndRelease(tx, current, {
                    paymentCancelledAt: new Date(),
                    paymentCancellationReason: "Automatisch storniert wegen ausbleibender Zahlung.",
                });
            }

            return tx.booking.findUnique({
                where: { id: booking.id },
                include: {
                    event: {
                        include: {
                            owner: true,
                        },
                    },
                },
            });
        });

        const manualDetails = getManualPaymentDetails({
            booking: updated,
            event: booking.event,
        });
        const cancelSummary = getPaymentAutoCancelSummary(booking);
        await sendPaymentCancellationEmail(
            updated,
            manualDetails,
            `${cancelSummary.label}${cancelSummary.value ? ` (${cancelSummary.value})` : ""}`
        );
    }

    return {
        scanned: bookings.length,
        sent,
        cancelled: autoCancelled.map((booking) => booking.id),
    };
}

export async function GET(request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
    }

    const result = await runReminderJob();
    return Response.json({ ok: true, ...result });
}

export async function POST(request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
    }

    const result = await runReminderJob();
    return Response.json({ ok: true, ...result });
}
