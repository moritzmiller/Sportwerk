import crypto from "node:crypto";

import { cookies } from "next/headers";

import { getCurrentUserWithErichRoles } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const ERICH_GUEST_COOKIE = "erich_guest_session";

const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;
const GUEST_EMAIL_DOMAIN = "guest.gatekeeper.local";

function tokenHash(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
}

function createGuestToken() {
    return crypto.randomBytes(32).toString("base64url");
}

export function guestUserIdFromToken(token) {
    return `erich_guest_${tokenHash(token)}`;
}

export function guestEmailFromToken(token) {
    return `erich-guest-${tokenHash(token)}@${GUEST_EMAIL_DOMAIN}`;
}

export function isErichGuestUser(user) {
    return Boolean(user?.id?.startsWith("erich_guest_") || user?.email?.endsWith(`@${GUEST_EMAIL_DOMAIN}`));
}

function guestCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    };
}

export async function getErichGuestToken() {
    const cookieStore = await cookies();
    return cookieStore.get(ERICH_GUEST_COOKIE)?.value ?? null;
}

export async function clearErichGuestSessionCookie() {
    const cookieStore = await cookies();
    cookieStore.delete(ERICH_GUEST_COOKIE);
}

async function ensureGuestUser(store, token) {
    const id = guestUserIdFromToken(token);
    const email = guestEmailFromToken(token);

    const user = await store.user.upsert({
        where: { id },
        create: {
            id,
            email,
            name: "ERICH Gast",
            role: "VISITOR",
        },
        update: {},
    });

    return {
        ...user,
        erichRoleAssignments: [],
        isErichGuest: true,
    };
}

async function findGuestUser(store, token) {
    if (!token) return null;

    const user = await store.user.findUnique({
        where: { id: guestUserIdFromToken(token) },
    });

    if (!user) return null;
    return {
        ...user,
        erichRoleAssignments: [],
        isErichGuest: true,
    };
}

export async function getOptionalErichGuestUser(store = prisma) {
    return findGuestUser(store, await getErichGuestToken());
}

export async function ensureErichGuestUser(store = prisma) {
    const cookieStore = await cookies();
    let token = cookieStore.get(ERICH_GUEST_COOKIE)?.value ?? null;

    if (!token) {
        token = createGuestToken();
        cookieStore.set(ERICH_GUEST_COOKIE, token, guestCookieOptions());
    }

    return ensureGuestUser(store, token);
}

export async function getCurrentErichUserOrGuest({ createGuest = false } = {}) {
    const currentUser = await getCurrentUserWithErichRoles();
    if (currentUser) return { user: currentUser, isGuest: false };

    const guest = createGuest
        ? await ensureErichGuestUser(prisma)
        : await getOptionalErichGuestUser(prisma);

    return { user: guest, isGuest: Boolean(guest) };
}

export async function claimErichGuestSessionForUser(store, { token, user }) {
    if (!token || !user?.id) {
        return { claimed: false, reason: "missing-context" };
    }

    const guestId = guestUserIdFromToken(token);
    if (guestId === user.id) {
        return { claimed: false, reason: "same-user" };
    }

    const guest = await store.user.findUnique({ where: { id: guestId } });
    if (!guest || !isErichGuestUser(guest)) {
        return { claimed: false, reason: "guest-not-found" };
    }

    const result = await store.$transaction(async (tx) => {
        const [
            athletes,
            trainers,
            batches,
            payments,
            billingProfiles,
            consentAcceptances,
            emailMessages,
            auditLogs,
        ] = await Promise.all([
            tx.erichAthlete.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichTrainer.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichRegistrationBatch.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichPayment.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichBillingProfile.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichConsentAcceptance.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichEmailMessage.updateMany({ where: { accountId: guestId }, data: { accountId: user.id } }),
            tx.erichAuditLog.updateMany({ where: { actorId: guestId }, data: { actorId: user.id } }),
        ]);

        await tx.user.delete({ where: { id: guestId } }).catch(() => null);

        return {
            athletes: athletes.count,
            trainers: trainers.count,
            batches: batches.count,
            payments: payments.count,
            billingProfiles: billingProfiles.count,
            consentAcceptances: consentAcceptances.count,
            emailMessages: emailMessages.count,
            auditLogs: auditLogs.count,
        };
    });

    await clearErichGuestSessionCookie();

    return {
        claimed: true,
        guestId,
        transferred: result,
    };
}
