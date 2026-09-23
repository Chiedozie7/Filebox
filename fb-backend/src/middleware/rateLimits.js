const path = require("path");
const fs = require("fs/promises");
const { rateLimit } = require("express-rate-limit");

const positiveInteger = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

const limits = {
    light: { windowMs: 60 * 1000, limit: positiveInteger("RATE_LIMIT_LIGHT_MAX", 60) },
    heavy: { windowMs: 10 * 60 * 1000, limit: positiveInteger("RATE_LIMIT_HEAVY_MAX", 5) },
    veryHeavy: { windowMs: 10 * 60 * 1000, limit: positiveInteger("RATE_LIMIT_VERY_HEAVY_MAX", 3) },
};

const createLimiter = (name) => rateLimit({
    ...limits[name],
    standardHeaders: "draft-8",
    legacyHeaders: false,
    identifier: name,
    handler: async (req, res) => {
        if (req.rateLimitCleanupFiles) {
            await Promise.all(req.rateLimitCleanupFiles.map(file => fs.rm(file.path, { force: true }).catch(() => {})));
        }
        res.status(429).json({
            error: "Rate limit exceeded",
            message: `Too many ${name === "light" ? "requests" : "processing jobs"}. Please try again later.`,
        });
    },
});

const light = createLimiter("light");
const heavy = createLimiter("heavy");
const veryHeavy = createLimiter("veryHeavy");

// Upload validation identifies the merge type before either limiter runs, so
// each merge consumes exactly one processing quota.
const getMergeClass = (req) => req.files?.some(file => path.extname(file.originalname).toLowerCase() !== ".pdf")
    ? "veryHeavy" : "heavy";

const mergeLimiter = (req, res, next) => {
    req.rateLimitCleanupFiles = req.files;
    return (getMergeClass(req) === "veryHeavy" ? veryHeavy : heavy)(req, res, next);
};

module.exports = {
    light,
    heavy,
    veryHeavy,
    mergeLimiter,
    getMergeClass,
    trustedProxyHops: positiveInteger("TRUST_PROXY_HOPS", 0),
};
