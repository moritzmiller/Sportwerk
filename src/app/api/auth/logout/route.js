import { createClient } from "@/lib/supabase/server";

// POST /api/auth/logout
export async function POST() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return Response.json({ ok: true });
}
