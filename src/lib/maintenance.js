const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const MAINTENANCE_RETENTION = Object.freeze({
    rateLimitHours: 24,
    systemEventDays: 90,
    scannerLinkDays: 30,
    eventSignalDays: 180,
});

function cutoff(now, amount, unitMs) {
    return new Date(now.getTime() - amount * unitMs);
}

export function buildMaintenanceCutoffs(
    now = new Date(),
    retention = MAINTENANCE_RETENTION
) {
    return {
        rateLimitResetBefore: cutoff(now, retention.rateLimitHours, HOUR_MS),
        systemEventCreatedBefore: cutoff(now, retention.systemEventDays, DAY_MS),
        scannerLinkExpiredBefore: cutoff(now, retention.scannerLinkDays, DAY_MS),
        erichTemporaryDraftExpiredBefore: now,
        eventSignalCreatedBefore: cutoff(now, retention.eventSignalDays, DAY_MS),
    };
}

function collectExpiredDraftAthleteIds(batches) {
    const athleteIds = new Set();

    for (const batch of batches) {
        for (const entry of batch.raceEntries ?? []) {
            if (entry.athleteId) athleteIds.add(entry.athleteId);
        }

        for (const teamEntry of batch.teamEntries ?? []) {
            for (const member of teamEntry.members ?? []) {
                if (member.athleteId) athleteIds.add(member.athleteId);
            }
        }
    }

    return athleteIds;
}

function buildDraftWindowAthleteWhere(batches) {
    const draftWindows = batches
        .filter((batch) => batch.accountId && batch.createdAt && batch.expiresAt)
        .map((batch) => ({
            accountId: batch.accountId,
            createdAt: {
                gte: batch.createdAt,
                lte: batch.expiresAt,
            },
        }));

    if (draftWindows.length === 0) return null;

    return {
        OR: draftWindows,
        raceEntries: { none: {} },
        teamMembers: { none: {} },
        tickets: { none: {} },
    };
}

async function cleanupExpiredErichTemporaryDrafts(store, { now }) {
    if (!store.$transaction || !store.erichRegistrationBatch || !store.erichAthlete) {
        return {
            erichTemporaryBatches: 0,
            erichTemporaryAthletes: 0,
            erichTemporaryConsents: 0,
        };
    }

    return store.$transaction(async (tx) => {
        const expiredBatches = await tx.erichRegistrationBatch.findMany({
            where: {
                status: "TEMPORARY",
                expiresAt: { lte: now },
            },
            select: {
                id: true,
                accountId: true,
                createdAt: true,
                expiresAt: true,
                raceEntries: {
                    select: {
                        athleteId: true,
                    },
                },
                teamEntries: {
                    select: {
                        members: {
                            select: {
                                athleteId: true,
                            },
                        },
                    },
                },
            },
        });

        if (expiredBatches.length === 0) {
            return {
                erichTemporaryBatches: 0,
                erichTemporaryAthletes: 0,
                erichTemporaryConsents: 0,
            };
        }

        const athleteIds = collectExpiredDraftAthleteIds(expiredBatches);
        const draftWindowAthleteWhere = buildDraftWindowAthleteWhere(expiredBatches);

        if (draftWindowAthleteWhere) {
            const unattachedAthletes = await tx.erichAthlete.findMany({
                where: draftWindowAthleteWhere,
                select: { id: true },
            });

            for (const athlete of unattachedAthletes) {
                athleteIds.add(athlete.id);
            }
        }

        const batchResult = await tx.erichRegistrationBatch.deleteMany({
            where: {
                id: { in: expiredBatches.map((batch) => batch.id) },
                status: "TEMPORARY",
                expiresAt: { lte: now },
            },
        });

        if (athleteIds.size === 0) {
            return {
                erichTemporaryBatches: batchResult.count,
                erichTemporaryAthletes: 0,
                erichTemporaryConsents: 0,
            };
        }

        const potentiallyDeletableAthleteIds = [...athleteIds];
        const deletableAthletes = await tx.erichAthlete.findMany({
            where: {
                id: { in: potentiallyDeletableAthleteIds },
                raceEntries: { none: {} },
                teamMembers: { none: {} },
                tickets: { none: {} },
            },
            select: { id: true },
        });
        const deletableAthleteIds = deletableAthletes.map((athlete) => athlete.id);

        if (deletableAthleteIds.length === 0) {
            return {
                erichTemporaryBatches: batchResult.count,
                erichTemporaryAthletes: 0,
                erichTemporaryConsents: 0,
            };
        }

        const consentResult = tx.erichConsentAcceptance
            ? await tx.erichConsentAcceptance.deleteMany({
                  where: {
                      athleteId: { in: deletableAthleteIds },
                  },
              })
            : { count: 0 };

        const athleteResult = await tx.erichAthlete.deleteMany({
            where: {
                id: { in: deletableAthleteIds },
                raceEntries: { none: {} },
                teamMembers: { none: {} },
                tickets: { none: {} },
            },
        });

        return {
            erichTemporaryBatches: batchResult.count,
            erichTemporaryAthletes: athleteResult.count,
            erichTemporaryConsents: consentResult.count,
        };
    });
}

export async function runMaintenanceCleanup({
    store,
    now = new Date(),
    retention = MAINTENANCE_RETENTION,
} = {}) {
    if (!store) {
        const { prisma } = await import("./prisma.js");
        store = prisma;
    }

    const cutoffs = buildMaintenanceCutoffs(now, retention);

    const [
        rateLimitBuckets,
        systemEvents,
        scannerLinks,
        erichDrafts,
        eventImpressions,
        eventInteractions,
    ] = await Promise.all([
        store.rateLimitBucket.deleteMany({
            where: {
                resetAt: { lt: cutoffs.rateLimitResetBefore },
            },
        }),
        store.systemEvent.deleteMany({
            where: {
                createdAt: { lt: cutoffs.systemEventCreatedBefore },
            },
        }),
        store.eventScannerLink.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: cutoffs.scannerLinkExpiredBefore } },
                    { revokedAt: { lt: cutoffs.scannerLinkExpiredBefore } },
                ],
            },
        }),
        cleanupExpiredErichTemporaryDrafts(store, {
            now: cutoffs.erichTemporaryDraftExpiredBefore,
        }),
        store.eventImpression
            ? store.eventImpression.deleteMany({
                  where: {
                      createdAt: { lt: cutoffs.eventSignalCreatedBefore },
                  },
              })
            : Promise.resolve({ count: 0 }),
        store.eventInteraction
            ? store.eventInteraction.deleteMany({
                  where: {
                      createdAt: { lt: cutoffs.eventSignalCreatedBefore },
                  },
              })
            : Promise.resolve({ count: 0 }),
    ]);

    return {
        cutoffs,
        deleted: {
            rateLimitBuckets: rateLimitBuckets.count,
            systemEvents: systemEvents.count,
            scannerLinks: scannerLinks.count,
            erichTemporaryBatches: erichDrafts.erichTemporaryBatches,
            erichTemporaryAthletes: erichDrafts.erichTemporaryAthletes,
            erichTemporaryConsents: erichDrafts.erichTemporaryConsents,
            eventImpressions: eventImpressions.count,
            eventInteractions: eventInteractions.count,
        },
    };
}
