import { writeErichAuditLog } from "./audit.js";
import { ERICH_PAYMENT_STATUS, markRegistrationBatchPaid } from "./registration-batches.js";

const STRIPE_PROVIDER = "STRIPE";
const SUCCESS_TYPES = new Set(["checkout.session.completed"]);

function isDuplicateWebhookError(error) {
    if (error?.code !== "P2002") return false;
    const target = error.meta?.target;
    const serializedTarget = Array.isArray(target) ? target.join(",") : String(target ?? "");

    return (
        error.meta?.modelName === "ErichPaymentWebhook" ||
        (serializedTarget.includes("provider") && serializedTarget.includes("providerEventId"))
    );
}

function stripeSessionFromEvent(event) {
    return event?.data?.object ?? null;
}

function stripePaymentIdFromSession(session) {
    return session?.metadata?.paymentId ?? null;
}

function stripeBatchIdFromSession(session) {
    return session?.metadata?.registrationBatchId ?? session?.client_reference_id ?? null;
}

async function createWebhookRecord(tx, { event, paymentId = null, processingResult = "received" }) {
    try {
        return await tx.erichPaymentWebhook.create({
            data: {
                paymentId,
                provider: STRIPE_PROVIDER,
                providerEventId: event.id,
                eventType: event.type,
                payload: event,
                processingResult,
            },
        });
    } catch (error) {
        if (isDuplicateWebhookError(error)) {
            return null;
        }

        throw error;
    }
}

export async function processStripeWebhookEvent(tx, event, { now = new Date() } = {}) {
    if (!event?.id || !event?.type) {
        return { action: "ignored", reason: "invalid-event" };
    }

    if (!SUCCESS_TYPES.has(event.type)) {
        const webhook = await createWebhookRecord(tx, {
            event,
            processingResult: `ignored-${event.type}`,
        });
        return webhook
            ? { action: "ignored", reason: "unsupported-event", eventType: event.type }
            : { action: "duplicate", eventType: event.type };
    }

    const session = stripeSessionFromEvent(event);
    const sessionId = session?.id ?? null;
    const metadataPaymentId = stripePaymentIdFromSession(session);
    const metadataBatchId = stripeBatchIdFromSession(session);

    if (!sessionId && !metadataPaymentId) {
        const webhook = await createWebhookRecord(tx, {
            event,
            processingResult: "missing-payment-reference",
        });
        return webhook
            ? { action: "ignored", reason: "missing-payment-reference" }
            : { action: "duplicate", eventType: event.type };
    }

    const payment = await tx.erichPayment.findFirst({
        where: {
            provider: STRIPE_PROVIDER,
            OR: [
                ...(sessionId ? [{ providerPaymentId: sessionId }] : []),
                ...(metadataPaymentId ? [{ id: metadataPaymentId }] : []),
            ],
        },
        include: {
            attempts: {
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    const webhook = await createWebhookRecord(tx, {
        event,
        paymentId: payment?.id ?? null,
        processingResult: payment ? "processing" : "payment-not-found",
    });

    if (!webhook) {
        return { action: "duplicate", eventType: event.type, sessionId };
    }

    if (!payment) {
        await tx.erichPaymentWebhook.update({
            where: { id: webhook.id },
            data: {
                processedAt: now,
                processingResult: "payment-not-found",
            },
        });
        return { action: "ignored", reason: "payment-not-found", sessionId };
    }

    const batch = await tx.erichRegistrationBatch.findUnique({
        where: { id: payment.registrationBatchId },
    });

    if (!batch) {
        await tx.erichPaymentWebhook.update({
            where: { id: webhook.id },
            data: {
                processedAt: now,
                processingResult: "batch-not-found",
            },
        });
        return { action: "ignored", reason: "batch-not-found", sessionId };
    }

    const transition = await markRegistrationBatchPaid(tx, batch, { paidAt: now });
    if (transition.action !== "paid" && transition.reason !== "already-paid") {
        await tx.erichPaymentWebhook.update({
            where: { id: webhook.id },
            data: {
                processedAt: now,
                processingResult: transition.reason,
            },
        });
        return { action: "ignored", reason: transition.reason, registrationBatchId: batch.id, sessionId };
    }

    const paymentAttempt = payment.attempts?.[0] ?? null;
    const providerPayload = {
        checkoutSession: session,
        checkoutSessionId: sessionId,
        paymentIntentId:
            typeof session?.payment_intent === "string"
                ? session.payment_intent
                : session?.payment_intent?.id ?? null,
    };

    const [updatedPayment, updatedAttempt] = await Promise.all([
        tx.erichPayment.update({
            where: { id: payment.id },
            data: {
                status: ERICH_PAYMENT_STATUS.SUCCESSFUL,
                providerPaymentId: sessionId ?? payment.providerPaymentId,
            },
        }),
        paymentAttempt
            ? tx.erichPaymentAttempt.update({
                  where: { id: paymentAttempt.id },
                  data: {
                      status: ERICH_PAYMENT_STATUS.SUCCESSFUL,
                      providerAttemptId: sessionId ?? paymentAttempt.providerAttemptId,
                      providerPayload,
                  },
              })
            : Promise.resolve(null),
    ]);

    await tx.erichPaymentWebhook.update({
        where: { id: webhook.id },
        data: {
            processedAt: now,
            processingResult: transition.reason === "already-paid" ? "already-paid" : "paid",
        },
    });

    await writeErichAuditLog({
        store: tx,
        eventId: payment.eventId,
        actorId: payment.accountId,
        entityType: "ErichRegistrationBatch",
        entityId: batch.id,
        action: "registration_batch.stripe_completed",
        reason: "ERICH Stripe checkout completed",
        oldValue: {
            status: batch.status,
        },
        newValue: {
            status: "PAID",
            paidAt: now,
            providerPaymentId: sessionId,
            metadataBatchId,
        },
        metadata: {
            paymentId: payment.id,
            paymentAttemptId: updatedAttempt?.id ?? null,
            stripeEventId: event.id,
        },
    });

    return {
        action: transition.reason === "already-paid" ? "already-paid" : "paid",
        registrationBatchId: batch.id,
        payment: updatedPayment,
        paymentAttempt: updatedAttempt,
        sessionId,
    };
}
