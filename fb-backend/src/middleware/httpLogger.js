const crypto = require("node:crypto");
const logger = require("../services/logger");

const requestIdFor = (req) => {
    const supplied = req.get("x-request-id");
    return supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
};

const routeFor = (req) => {
    if (!req.route) return req.path === "/health" ? "/health" : "unmatched";
    const routePath = Array.isArray(req.route.path) ? req.route.path.join("|") : req.route.path;
    return `${req.baseUrl || ""}${routePath}`;
};

const httpLogger = (req, res, next) => {
    const requestId = requestIdFor(req);
    const started = process.hrtime.bigint();
    res.setHeader("X-Request-ID", requestId);
    res.once("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        logger.runWithContext({ requestId, method: req.method }, () => logger.info("http_request", {
            requestId,
            method: req.method,
            route: routeFor(req),
            statusCode: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
        }));
    });
    logger.runWithContext({ requestId, method: req.method }, next);
};

module.exports = { httpLogger, routeFor, requestIdFor };
