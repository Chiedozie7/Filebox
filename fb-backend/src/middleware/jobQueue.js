const { getMergeClass } = require("./rateLimits");
const logger = require("../services/logger");

const positiveInteger = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

const defaults = {
    heavyConcurrency: positiveInteger("JOB_QUEUE_HEAVY_CONCURRENCY", 2),
    veryHeavyConcurrency: positiveInteger("JOB_QUEUE_VERY_HEAVY_CONCURRENCY", 1),
    maxWaiting: positiveInteger("JOB_QUEUE_MAX_WAITING", 10),
};

const createJobQueue = ({ heavyConcurrency = defaults.heavyConcurrency,
    veryHeavyConcurrency = defaults.veryHeavyConcurrency,
    maxWaiting = defaults.maxWaiting } = {}) => {
    const classes = {
        heavy: { limit: heavyConcurrency, active: 0, waiting: [] },
        veryHeavy: { limit: veryHeavyConcurrency, active: 0, waiting: [] },
    };
    let waitingCount = 0;

    const drain = (kind) => {
        const group = classes[kind];
        while (group.active < group.limit && group.waiting.length) {
            const ticket = group.waiting.shift();
            waitingCount--;
            ticket.grant();
        }
    };

    const acquire = (selectClass) => (req, res, next) => {
        const kind = typeof selectClass === "function" ? selectClass(req) : selectClass;
        const group = classes[kind];
        if (!group) return next(new Error(`Unknown job queue class: ${kind}`));

        let waiting = false;
        const removeListeners = () => {
            req.off("aborted", cancel);
            res.off("close", cancel);
        };
        const cancel = () => {
            if (!waiting) return;
            waiting = false;
            const index = group.waiting.indexOf(ticket);
            if (index !== -1) {
                group.waiting.splice(index, 1);
                waitingCount--;
            }
            removeListeners();
        };
        const ticket = {
            grant: () => {
                waiting = false;
                removeListeners();
                if (req.aborted || res.destroyed) return;
                group.active++;
                let released = false;
                req.jobQueueLease = {
                    release: () => {
                        if (released) return;
                        released = true;
                        group.active--;
                        drain(kind);
                    },
                };
                next();
            },
        };

        if (group.active < group.limit && !group.waiting.length) {
            ticket.grant();
        } else if (waitingCount >= maxWaiting) {
            logger.warn("job_queue_rejected", { queueClass: kind, waiting: waitingCount, maxWaiting, statusCode: 503 });
            res.status(503).json({ error: "Job queue is full", message: "Please try again later." });
        } else {
            waiting = true;
            waitingCount++;
            group.waiting.push(ticket);
            req.once("aborted", cancel);
            res.once("close", cancel);
        }
    };

    const run = (handler) => async (req, res, next) => {
        try {
            if (req.aborted || res.destroyed) return;
            return await handler(req, res, next);
        } finally {
            req.jobQueueLease?.release();
        }
    };

    return {
        heavy: acquire("heavy"),
        veryHeavy: acquire("veryHeavy"),
        merge: acquire(getMergeClass),
        run,
        stats: () => ({
            heavy: { active: classes.heavy.active, waiting: classes.heavy.waiting.length },
            veryHeavy: { active: classes.veryHeavy.active, waiting: classes.veryHeavy.waiting.length },
            waiting: waitingCount,
        }),
    };
};

module.exports = { ...createJobQueue(), createJobQueue, defaults };
