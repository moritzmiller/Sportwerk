#!/usr/bin/env node

import {
    applyUnifiedMigrationPlanFromErichBatch,
    buildUnifiedMigrationPlanFromErichBatch,
    ensureUnifiedEventForErichEvent,
} from "../src/lib/erich/unified-migration.js";

async function createScriptPrismaClient() {
    const [{ PrismaClient }, { PrismaPg }, pgModule, nextEnv, { getDatabaseUrl }] =
        await Promise.all([
            import("@prisma/client"),
            import("@prisma/adapter-pg"),
            import("pg"),
            import("@next/env"),
            import("../src/lib/env.js"),
        ]);

    const loadEnvConfig = nextEnv.loadEnvConfig ?? nextEnv.default?.loadEnvConfig;
    loadEnvConfig(process.cwd());

    const pool = new pgModule.default.Pool({
        connectionString: getDatabaseUrl(),
    });
    const prisma = new PrismaClient({
        adapter: new PrismaPg(pool),
        log: ["error"],
    });

    return {
        prisma,
        disconnect: async () => {
            await prisma.$disconnect();
            await pool.end();
        },
    };
}

function readArgs(argv) {
    const args = {
        eventMap: new Map(),
        limit: 50,
        status: null,
        apply: false,
        ownerId: null,
        help: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === "--help" || value === "-h") {
            args.help = true;
        } else if (value === "--apply") {
            args.apply = true;
        } else if (value === "--event-map") {
            const mapping = argv[index + 1] ?? "";
            index += 1;
            const [legacyEventId, unifiedEventId] = mapping.split(":");
            const numericEventId = unifiedEventId === "auto" ? null : Number(unifiedEventId);
            if (!legacyEventId || (unifiedEventId !== "auto" && !Number.isInteger(numericEventId))) {
                throw new Error("--event-map expects <erichEventId>:<numericEventId> or <erichEventId>:auto.");
            }
            args.eventMap.set(legacyEventId, numericEventId);
        } else if (value === "--owner-id") {
            args.ownerId = String(argv[index + 1] ?? "").trim() || null;
            index += 1;
        } else if (value === "--limit") {
            args.limit = Math.max(1, Math.min(500, Number(argv[index + 1]) || args.limit));
            index += 1;
        } else if (value === "--status") {
            args.status = String(argv[index + 1] ?? "").trim().toUpperCase() || null;
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${value}`);
        }
    }

    return args;
}

function printUsage() {
    console.log(`Usage:
  node scripts/erich-unified-migration-dry-run.mjs --event-map <erichEventId>:<eventId|auto> [--event-map ...] [--owner-id <userId>] [--status PAID] [--limit 50] [--apply]

Examples:
  node scripts/erich-unified-migration-dry-run.mjs --event-map erich-2026:42 --status PAID
  node scripts/erich-unified-migration-dry-run.mjs --event-map erich-2026:auto --owner-id user_123 --status PAID
  node scripts/erich-unified-migration-dry-run.mjs --event-map erich-2026:42 --status PAID --apply

Without --apply this is a read-only dry run. With --apply it writes unified Booking, Payment and Ticket records transactionally and skips batches that were already migrated. The :auto event map value creates or reuses a unified ERICH Event and requires --owner-id.`);
}

function summarizePlan(plan) {
    return {
        legacySource: plan.legacySource,
        booking: {
            eventId: plan.booking.eventId,
            purchaserEmail: plan.booking.purchaserEmail,
            quantity: plan.booking.quantity,
            totalAmount: plan.booking.totalAmount,
            status: plan.booking.status,
            paymentMethod: plan.booking.paymentMethod,
            paymentProvider: plan.booking.paymentProvider,
        },
        payment: plan.payment
            ? {
                  provider: plan.payment.provider,
                  method: plan.payment.method,
                  status: plan.payment.status,
                  amountCents: plan.payment.amountCents,
                  idempotencyKey: plan.payment.idempotencyKey,
              }
            : null,
        ticketCount: plan.tickets.length,
        ticketPreview: plan.tickets.slice(0, 5).map((ticket) => ({
            ticketNumber: ticket.ticketNumber,
            holderName: ticket.holderName,
            raceNumber: ticket.holderDetails?.raceNumber ?? null,
            sourceType: ticket.holderDetails?.legacySource?.type ?? null,
        })),
    };
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    if (args.eventMap.size === 0) {
        throw new Error("At least one --event-map <erichEventId>:<numericEventId> is required.");
    }

    const { prisma, disconnect } = await createScriptPrismaClient();
    try {
        const eventMappingResults = [];
        for (const [legacyEventId, unifiedEventId] of args.eventMap) {
            if (unifiedEventId !== null) continue;
            if (!args.ownerId) {
                throw new Error("--owner-id is required when an --event-map value is :auto.");
            }

            const erichEvent = await prisma.erichEvent.findUnique({
                where: { id: legacyEventId },
            });
            if (!erichEvent) {
                throw new Error(`Legacy ERICH event not found: ${legacyEventId}`);
            }

            const mapping = await ensureUnifiedEventForErichEvent(prisma, {
                erichEvent,
                ownerId: args.ownerId,
            });
            args.eventMap.set(legacyEventId, mapping.event.id);
            eventMappingResults.push(mapping);
        }

        const batches = await prisma.erichRegistrationBatch.findMany({
            where: {
                eventId: { in: [...args.eventMap.keys()] },
                ...(args.status ? { status: args.status } : {}),
            },
            include: {
                account: true,
                raceEntries: {
                    include: {
                        athlete: true,
                        raceDefinition: true,
                        valuations: true,
                    },
                    orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
                },
                teamEntries: {
                    orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
                },
                payments: {
                    include: {
                        attempts: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
            orderBy: { createdAt: "asc" },
            take: args.limit,
        });

        const plans = batches.map((batch) => ({
            batch,
            plan: buildUnifiedMigrationPlanFromErichBatch({
                batch,
                eventId: args.eventMap.get(batch.eventId),
            }),
        }));

        if (args.apply) {
            const results = [];
            for (const { batch } of plans) {
                const result = await prisma.$transaction((tx) =>
                    applyUnifiedMigrationPlanFromErichBatch(tx, {
                        batch,
                        eventId: args.eventMap.get(batch.eventId),
                    })
                );
                results.push(result);
            }

            console.log(
                JSON.stringify(
                    {
                        dryRun: false,
                        applied: true,
                        batchCount: batches.length,
                        eventMap: Object.fromEntries(args.eventMap),
                        eventMappings: eventMappingResults,
                        status: args.status,
                        results,
                    },
                    null,
                    2
                )
            );
            return;
        }

        console.log(
            JSON.stringify(
                {
                    dryRun: true,
                    batchCount: batches.length,
                    eventMap: Object.fromEntries(args.eventMap),
                    eventMappings: eventMappingResults,
                    status: args.status,
                    plans: plans.map(({ plan }) => summarizePlan(plan)),
                },
                null,
                2
            )
        );
    } finally {
        await disconnect();
    }
}

main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
});
