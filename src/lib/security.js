const TEXT_DECODER = new TextDecoder();
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i;
const HTTPS_IMAGE_PATTERN = /^https:\/\/[^\s]+$/i;

export class RequestBodyTooLargeError extends Error {
    constructor(limit) {
        super("Request body too large.");
        this.name = "RequestBodyTooLargeError";
        this.status = 413;
        this.limit = limit;
    }
}

export class InvalidJsonError extends Error {
    constructor() {
        super("Invalid JSON.");
        this.name = "InvalidJsonError";
        this.status = 400;
    }
}

export function securityJsonError(message, status = 400, headers = {}) {
    return Response.json({ error: message }, { status, headers });
}

export async function readJsonBody(request, { maxBytes = 128 * 1024 } = {}) {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > maxBytes) {
        throw new RequestBodyTooLargeError(maxBytes);
    }

    if (!request.body) {
        return {};
    }

    const reader = request.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        received += value.byteLength;
        if (received > maxBytes) {
            throw new RequestBodyTooLargeError(maxBytes);
        }

        chunks.push(value);
    }

    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }

    const text = TEXT_DECODER.decode(body).trim();
    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new InvalidJsonError();
    }
}

export function requestBodyErrorResponse(error) {
    if (error instanceof RequestBodyTooLargeError) {
        return securityJsonError("Anfrage ist zu gross.", 413, {
            "X-Max-Body-Bytes": String(error.limit),
        });
    }

    if (error instanceof InvalidJsonError) {
        return securityJsonError("Ungültiges JSON.", 400);
    }

    return null;
}

export function normalizeSafeText(value, { maxLength = 500, fallback = "" } = {}) {
    const text = String(value ?? fallback)
        .replace(CONTROL_CHARS, "")
        .trim();

    return text.slice(0, maxLength);
}

export function isValidEmail(value) {
    const email = normalizeSafeText(value, { maxLength: 254 }).toLowerCase();
    return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function normalizeEmail(value) {
    return normalizeSafeText(value, { maxLength: 254 }).toLowerCase();
}

export function isBotTrapTriggered(body, { minElapsedMs = 900 } = {}) {
    const honeypot = normalizeSafeText(body.website || body.company || body.url, {
        maxLength: 200,
    });
    if (honeypot) {
        return true;
    }

    const startedAt = Number(body.formStartedAt || 0);
    if (startedAt > 0 && Date.now() - startedAt < minElapsedMs) {
        return true;
    }

    return false;
}

export function isAllowedDataImage(value, { maxBytes = 1500 * 1024 } = {}) {
    const image = normalizeSafeText(value, { maxLength: maxBytes * 2 });
    if (!ALLOWED_DATA_IMAGE_PATTERN.test(image)) {
        return false;
    }

    const base64Length = image.split(",", 2)[1]?.length ?? 0;
    const estimatedBytes = Math.floor((base64Length * 3) / 4);
    return estimatedBytes <= maxBytes;
}

export function isAllowedImageReference(value, { maxDataBytes = 1500 * 1024 } = {}) {
    const image = normalizeSafeText(value, { maxLength: maxDataBytes * 2 });
    return HTTPS_IMAGE_PATTERN.test(image) || isAllowedDataImage(image, { maxBytes: maxDataBytes });
}
