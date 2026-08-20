import nextEnv from "@next/env";
import { sendTransactionalMail } from "../src/lib/mail.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function readArg(name) {
    const prefix = `--${name}=`;
    const inline = process.argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length).trim();

    const index = process.argv.indexOf(`--${name}`);
    if (index >= 0) return process.argv[index + 1]?.trim();

    return "";
}

const to = readArg("to") || process.env.TEST_TO || "";
const subject = readArg("subject") || "GateKeeper Resend Test";

if (!to) {
    console.error("Missing recipient. Use `npm run mail:test -- --to you@example.com` or set TEST_TO.");
    process.exit(1);
}

try {
    const result = await sendTransactionalMail({
        to,
        subject,
        html: "<p>GateKeeper transactional mail is working.</p>",
    });
    console.log(`Mail sent via ${result.provider}.`);
} catch (error) {
    console.error("Test mail failed:", error?.message || error);
    if (error?.details) {
        console.error("Details:", JSON.stringify(error.details));
    }
    process.exit(1);
}
