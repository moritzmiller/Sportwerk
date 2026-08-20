import { defineConfig } from "prisma/config";
import { loadEnvConfig } from "@next/env";

// Next.js lädt hier alle .env, .env.local etc. aus dem aktuellen Verzeichnis
loadEnvConfig(process.cwd());

function getDatasourceUrl(name, fallback) {
    const value = process.env[name];
    if (value) {
        return value;
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error(`${name} is required in production. Prisma will not use a local fallback.`);
    }

    // Prisma generate only needs a syntactically valid URL here.
    return fallback;
}

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: {
        url: getDatasourceUrl("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres"),
        directUrl: getDatasourceUrl("DIRECT_URL", "postgresql://postgres:postgres@localhost:5432/postgres"),
    } as any, // Der Workaround von vorhin wegen des Prisma-Typenbugs
});
