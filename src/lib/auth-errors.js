export function isSupabasePublicConfigMissing(error) {
    return error?.code === "SUPABASE_PUBLIC_CONFIG_MISSING";
}
