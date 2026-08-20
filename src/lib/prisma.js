import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { getDatabaseUrl } from "./env.js";

// Globaler Speicher ohne TypeScript-Typen (funktioniert überall)
const globalForPrisma = globalThis;
const connectionString = getDatabaseUrl();
const poolMax = Math.max(1, Math.min(20, Number(process.env.DATABASE_POOL_MAX || 5)));

if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = new pg.Pool({
        connectionString,
        max: poolMax,
        idleTimeoutMillis: 30 * 1000,
        connectionTimeoutMillis: 10 * 1000,
    });
}

const adapter = new PrismaPg(globalForPrisma.pgPool);

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
