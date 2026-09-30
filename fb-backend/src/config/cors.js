const LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://[::1]:3001",
];

const parseOrigins = (value = "") => value.split(",").map(value => value.trim()).filter(Boolean).map(value => {
    let parsed;
    try { parsed = new URL(value); }
    catch { throw new Error("CORS_ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins"); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" ||
        parsed.search || parsed.hash || parsed.username || parsed.password) {
        throw new Error("CORS_ALLOWED_ORIGINS must contain origins without paths or credentials");
    }
    return parsed.origin;
});

const createCorsOptions = ({
    environment = process.env.NODE_ENV || "development",
    allowedOrigins = process.env.CORS_ALLOWED_ORIGINS || "",
} = {}) => {
    const origins = new Set(parseOrigins(allowedOrigins));
    if (environment !== "production") LOCAL_FRONTEND_ORIGINS.forEach(origin => origins.add(origin));

    return {
        origin(origin, callback) {
            if (!origin || origins.has(origin)) return callback(null, true);
            const error = new Error("Origin not allowed");
            error.code = "CORS_ORIGIN_DENIED";
            error.status = 403;
            callback(error);
        },
        methods: ["GET", "HEAD", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "X-Request-ID"],
        exposedHeaders: ["Content-Disposition", "X-Request-ID", "RateLimit", "RateLimit-Policy", "Retry-After"],
        maxAge: 600,
        optionsSuccessStatus: 204,
    };
};

module.exports = { createCorsOptions, LOCAL_FRONTEND_ORIGINS };
