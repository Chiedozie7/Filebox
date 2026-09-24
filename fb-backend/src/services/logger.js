const { AsyncLocalStorage } = require("node:async_hooks");

const contextStorage = new AsyncLocalStorage();
const SECRET_FIELD = /(secret|credential|password|token|signature|authorization|cookie|url|body|content|stdout|stderr|buffer)/i;
const redactText = (value) => String(value)
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/\b(bearer|basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/\b(access[_ -]?key|secret[_ -]?key|password|token|signature)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);

const normalizeError = (error) => {
    if (!error) return undefined;
    const value = error instanceof Error ? error : new Error(String(error));
    const safe = { name: redactText(value.name || "Error") };
    if (value.code && /^[A-Za-z0-9_.-]{1,80}$/.test(String(value.code))) safe.code = value.code;
    if (value.message) safe.message = redactText(value.message);
    return safe;
};

const sanitize = (value, key = "", depth = 0) => {
    if (SECRET_FIELD.test(key)) return "[REDACTED]";
    if (key === "error") return normalizeError(value);
    if (value instanceof Error) return normalizeError(value);
    if (typeof value === "string") return redactText(value);
    if (value === null || ["number", "boolean"].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, "", depth + 1));
    if (typeof value === "object") {
        if (depth > 2) return "[OMITTED]";
        return Object.fromEntries(Object.entries(value).slice(0, 40).map(([childKey, child]) =>
            [childKey, sanitize(child, childKey, depth + 1)]));
    }
    return String(value);
};

const createLogger = ({ environment = process.env.NODE_ENV || "development", write } = {}) => {
    const output = write || ((line, level) => (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`));
    const emit = (level, event, fields = {}) => {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            event: redactText(event),
            ...sanitize(contextStorage.getStore() || {}),
            ...sanitize(fields),
        };
        const line = environment === "production"
            ? JSON.stringify(entry)
            : `${entry.timestamp} ${level.toUpperCase()} ${entry.event} ${JSON.stringify(entry)}`;
        output(line, level);
        return entry;
    };
    return {
        debug: (event, fields) => emit("debug", event, fields),
        info: (event, fields) => emit("info", event, fields),
        warn: (event, fields) => emit("warn", event, fields),
        error: (event, fields) => emit("error", event, fields),
        runWithContext: (context, callback) => contextStorage.run({ ...contextStorage.getStore(), ...context }, callback),
    };
};

module.exports = { ...createLogger(), createLogger, normalizeError, redactText };
