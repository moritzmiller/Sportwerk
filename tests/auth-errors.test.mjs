import assert from "node:assert/strict";
import test from "node:test";
import { isSupabasePublicConfigMissing } from "../src/lib/auth-errors.js";

test("detects missing Supabase public config errors", () => {
    assert.equal(
        isSupabasePublicConfigMissing({
            code: "SUPABASE_PUBLIC_CONFIG_MISSING",
        }),
        true
    );
});

test("does not treat unrelated auth errors as missing public config", () => {
    assert.equal(isSupabasePublicConfigMissing(new Error("network failed")), false);
    assert.equal(isSupabasePublicConfigMissing({ code: "SUPABASE_ADMIN_CONFIG_MISSING" }), false);
    assert.equal(isSupabasePublicConfigMissing(null), false);
});
