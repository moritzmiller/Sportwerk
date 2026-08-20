import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";

export function createClient() {
    const config = getSupabaseConfig();
    if (!config.url || !config.anonKey) {
        const error = new Error(
            "Supabase public auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
        error.code = "SUPABASE_PUBLIC_CONFIG_MISSING";
        throw error;
    }

    return createBrowserClient(
        config.url,
        config.anonKey
    );
}
