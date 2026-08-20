#!/usr/bin/env node

import { readErichExcelDryRun } from "../src/lib/erich/excel-import.js";
import { applyErichRaceMasterData } from "../src/lib/erich/master-data-import.js";

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
        log: ["query", "error"],
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
        filePath: null,
        apply: false,
        eventId: null,
        activePhaseKey: null,
        actorId: null,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === "--apply") {
            args.apply = true;
        } else if (value === "--event-id") {
            args.eventId = argv[index + 1] ?? null;
            index += 1;
        } else if (value === "--active-phase") {
            args.activePhaseKey = argv[index + 1] ?? null;
            index += 1;
        } else if (value === "--actor-id") {
            args.actorId = argv[index + 1] ?? null;
            index += 1;
        } else if (!args.filePath) {
            args.filePath = value;
        } else {
            throw new Error(`Unknown argument: ${value}`);
        }
    }

    return args;
}

const args = readArgs(process.argv.slice(2));

if (!args.filePath) {
    console.error(
        "Usage: node scripts/erich-import-dry-run.mjs <workbook.xlsx> [--apply --event-id <id> --active-phase SEPT|OCT_NOV|DEC_JAN --actor-id <userId>]"
    );
    process.exit(1);
}

try {
    const dryRun = await readErichExcelDryRun(args.filePath);
    const issueRows = dryRun.races
        .filter((race) => race.issues.length > 0)
        .map((race) => ({
            raceNumber: race.raceNumber,
            sourceRow: race.sourceRow,
            classLabel: race.classLabel,
            distanceLabel: race.distanceLabel,
            expectedPriceLevel: race.expectedPriceLevel,
            issues: race.issues.map((issue) => issue.code),
        }));

    console.log(
        JSON.stringify(
            {
                summary: dryRun.summary,
                issueRows,
            },
            null,
            2
        )
    );

    if (args.apply) {
        if (!args.eventId) {
            throw new Error("--event-id is required when --apply is used.");
        }

        const { prisma, disconnect } = await createScriptPrismaClient();
        try {
            const result = await applyErichRaceMasterData(prisma, {
                eventId: args.eventId,
                dryRun,
                activePhaseKey: args.activePhaseKey,
                actorId: args.actorId,
            });

            console.log(
                JSON.stringify(
                    {
                        applied: {
                            importJobId: result.importJob.id,
                            createdRaceCount: result.createdRaceCount,
                            updatedRaceCount: result.updatedRaceCount,
                            unchangedRaceCount: result.unchangedRaceCount,
                            activeRaceCount: result.activeRaceCount,
                            reviewRequiredRaceCount: result.reviewRequiredRaceCount,
                            priceCount: result.priceCount,
                        },
                    },
                    null,
                    2
                )
            );
        } finally {
            await disconnect();
        }
    }
} catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
}
