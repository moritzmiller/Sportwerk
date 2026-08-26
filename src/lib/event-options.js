export const EVENT_TYPES = Object.freeze({
    STANDARD: "STANDARD",
    ERICH: "ERICH",
});

const QUESTION_TYPES = new Set(["text", "number", "date", "time", "select", "checkbox"]);
const DEFAULT_MAX_LENGTH = 500;

export const DEFAULT_ERICH_BOOKING_QUESTIONS = Object.freeze([
    {
        id: "raceNumber",
        label: "Rennnummer",
        type: "number",
        required: true,
        scope: "entry",
    },
    {
        id: "athleteBirthDate",
        label: "Geburtsdatum",
        type: "date",
        required: true,
        scope: "attendee",
    },
    {
        id: "clubName",
        label: "Verein",
        type: "text",
        required: true,
        scope: "attendee",
    },
    {
        id: "ageClass",
        label: "Altersklasse",
        type: "text",
        required: true,
        scope: "entry",
    },
    {
        id: "targetTime",
        label: "Zielzeit",
        type: "time",
        required: false,
        scope: "entry",
    },
]);

export const DEFAULT_ERICH_EVENT_OPTIONS = Object.freeze({
    features: {
        seatingEnabled: false,
        raceRegistration: true,
    },
    raceSelectionMode: "ORDER_FORM",
    ageRuleMode: "ORDER_FORM",
    bookingQuestions: DEFAULT_ERICH_BOOKING_QUESTIONS,
});

export function normalizeEventType(value) {
    const eventType = String(value ?? EVENT_TYPES.STANDARD).trim().toUpperCase();
    return Object.values(EVENT_TYPES).includes(eventType) ? eventType : EVENT_TYPES.STANDARD;
}

function normalizeQuestion(rawQuestion, index) {
    const id = normalizeIdentifier(rawQuestion?.id) || `question${index + 1}`;
    const type = QUESTION_TYPES.has(rawQuestion?.type) ? rawQuestion.type : "text";
    const label = normalizeText(rawQuestion?.label, { maxLength: 120 }) || id;
    const options = Array.isArray(rawQuestion?.options)
        ? rawQuestion.options
              .map((option) => normalizeText(option, { maxLength: 120 }))
              .filter(Boolean)
              .slice(0, 40)
        : [];

    return {
        id,
        label,
        type,
        required: Boolean(rawQuestion?.required),
        scope: normalizeText(rawQuestion?.scope, { maxLength: 40 }) || "booking",
        ...(type === "select" ? { options } : {}),
    };
}

export function normalizeEventOptions(eventType, rawOptions = {}) {
    const normalizedType = normalizeEventType(eventType);
    const baseOptions =
        normalizedType === EVENT_TYPES.ERICH
            ? DEFAULT_ERICH_EVENT_OPTIONS
            : { features: { seatingEnabled: false }, bookingQuestions: [] };
    const source = isPlainObject(rawOptions) ? rawOptions : {};
    const sourceFeatures = isPlainObject(source.features) ? source.features : {};
    const bookingQuestionsSource = Array.isArray(source.bookingQuestions)
        ? source.bookingQuestions
        : baseOptions.bookingQuestions;
    const bookingQuestions = bookingQuestionsSource
        .map((question, index) => normalizeQuestion(question, index))
        .slice(0, 30);

    return {
        ...baseOptions,
        ...source,
        features: {
            ...baseOptions.features,
            ...sourceFeatures,
            seatingEnabled: Boolean(sourceFeatures.seatingEnabled),
            raceRegistration:
                normalizedType === EVENT_TYPES.ERICH
                    ? sourceFeatures.raceRegistration !== false
                    : Boolean(sourceFeatures.raceRegistration),
        },
        bookingQuestions,
    };
}

export function getEventBookingQuestions(event = {}) {
    const options = normalizeEventOptions(event.eventType, event.eventOptions);
    return options.bookingQuestions ?? [];
}

export function normalizeRegistrationAnswers(event, rawAnswers = {}) {
    const questions = getEventBookingQuestions(event);
    const source = isPlainObject(rawAnswers) ? rawAnswers : {};
    const answers = {};
    const errors = [];

    for (const question of questions) {
        const normalized = normalizeAnswerValue(question, source[question.id]);
        if (question.required && isEmptyAnswer(normalized)) {
            errors.push(`${question.label} ist erforderlich.`);
            continue;
        }

        if (!isEmptyAnswer(normalized)) {
            answers[question.id] = {
                label: question.label,
                type: question.type,
                scope: question.scope,
                value: normalized,
            };
        }
    }

    return {
        data: {
            eventType: normalizeEventType(event.eventType),
            answers,
        },
        errors,
    };
}

function normalizeAnswerValue(question, value) {
    if (question.type === "checkbox") return Boolean(value);

    if (question.type === "number") {
        const number = Number(value);
        return Number.isFinite(number) ? number : "";
    }

    const text = normalizeText(value, { maxLength: DEFAULT_MAX_LENGTH });
    if (question.type === "select" && question.options?.length > 0) {
        return question.options.includes(text) ? text : "";
    }

    return text;
}

function isEmptyAnswer(value) {
    return value === "" || value === null || typeof value === "undefined";
}

function normalizeIdentifier(value) {
    return String(value ?? "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 80);
}

function normalizeText(value, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
    return String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, maxLength);
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
