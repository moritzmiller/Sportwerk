import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";

function requirePublicSupabaseConfig() {
    const config = getSupabaseConfig();
    if (!config.url || !config.anonKey) {
        const error = new Error(
            "Supabase public auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
        error.code = "SUPABASE_PUBLIC_CONFIG_MISSING";
        throw error;
    }
    return config;
}

function requireAdminSupabaseConfig() {
    const config = requirePublicSupabaseConfig();
    if (!config.serviceRoleKey) {
        const error = new Error(
            "Supabase admin auth is not configured. Set SUPABASE_SERVICE_ROLE_KEY."
        );
        error.code = "SUPABASE_ADMIN_CONFIG_MISSING";
        throw error;
    }
    return config;
}

export async function createClient() {
    const cookieStore = await cookies();
    const config = requirePublicSupabaseConfig();

    return createServerClient(
        config.url,
        config.anonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Called from a Server Component - can be ignored when
                        // proxy refreshes the session.
                    }
                },
            },
        }
    );
}

// Service-role client for admin operations (bypasses RLS). Server-only.
export function createAdminClient() {
    const { createClient: createSbClient } = require("@supabase/supabase-js");
    const config = requireAdminSupabaseConfig();
    return createSbClient(
        config.url,
        config.serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

export function createPublicAuthClient() {
    const { createClient: createSbClient } = require("@supabase/supabase-js");
    const config = requirePublicSupabaseConfig();
    return createSbClient(
        config.url,
        config.anonKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}
