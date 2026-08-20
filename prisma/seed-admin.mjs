/**
 * Seed-Script: legt genau einen Admin-Account an (Supabase Auth + Prisma).
 * Aufruf:  node prisma/seed-admin.mjs
 * Env:     ADMIN_EMAIL, ADMIN_PASSWORD  (Fallback: Werte unten anpassen)
 */
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl, getSupabaseConfig } from "../src/lib/env.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("Bitte ADMIN_EMAIL und ADMIN_PASSWORD als Env-Variablen setzen.");
    process.exit(1);
}

const supabaseConfig = getSupabaseConfig();
const supabase = createClient(
    supabaseConfig.url,
    supabaseConfig.serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

async function main() {
    // 1. Auth-User anlegen (E-Mail direkt bestätigt).
    let authUserId;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { role: "ADMIN", name: "Administrator" },
    });

    if (createErr) {
        // Existiert evtl. schon -> suchen.
        if (/already been registered|already exists/i.test(createErr.message)) {
            const { data: list } = await supabase.auth.admin.listUsers();
            const found = list.users.find((u) => u.email === ADMIN_EMAIL);
            if (!found) throw createErr;
            authUserId = found.id;
            console.log("Admin-Auth-User existierte bereits, nutze vorhandenen.");
        } else {
            throw createErr;
        }
    } else {
        authUserId = created.user.id;
        console.log("Admin-Auth-User erstellt.");
    }

    // 2. Prisma-User mit Rolle ADMIN upserten.
    await prisma.user.upsert({
        where: { id: authUserId },
        update: { role: "ADMIN", email: ADMIN_EMAIL, name: "Administrator" },
        create: {
            id: authUserId,
            email: ADMIN_EMAIL,
            name: "Administrator",
            role: "ADMIN",
        },
    });

    console.log(`✅ Admin bereit: ${ADMIN_EMAIL} (id: ${authUserId})`);
}

main()
    .catch((e) => {
        console.error("Seed fehlgeschlagen:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
