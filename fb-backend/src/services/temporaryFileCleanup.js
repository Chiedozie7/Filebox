const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const fileRepository = require("../repositories/fileRepository");
const r2Service = require("./r2Service");
const appLogger = require("./logger");

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const PERMANENT_LOOKUP_TIMEOUT_MS = 5000;
const TEMP_PREFIXES = ["fileforge-ocr-", "fileforge-excel-pdf-", "fileforge-mixed-merge-"];
const configuredMinutes = Number(process.env.FILE_CLEANUP_TTL_MINUTES);
const configuredTtlMs = Number.isFinite(configuredMinutes) && configuredMinutes > 0
    ? Math.max(1000, Math.floor(configuredMinutes * 60 * 1000))
    : DEFAULT_TTL_MS;

const createCleanupService = ({
    uploadsDir = path.resolve(__dirname, "../../uploads"),
    tempRoot = os.tmpdir(),
    ttlMs = configuredTtlMs,
    getPermanentNames = () => fileRepository.getStoredNames(),
    sweepR2 = () => r2Service.sweep(),
    logger = appLogger,
} = {}) => {
    const uploadsRoot = path.resolve(uploadsDir);
    const systemTempRoot = path.resolve(tempRoot);
    const jobs = new Set();
    let sweepPromise;
    let pendingSweep = false;
    let timer;
    let databaseWarningShown = false;

    const insideUploads = (filePath) => path.dirname(path.resolve(filePath)) === uploadsRoot;

    const registerOutput = (req, filePath) => {
        if (!insideUploads(filePath)) throw new Error("Generated output must be inside uploads");
        req.cleanupJob?.outputs.add(path.resolve(filePath));
        return filePath;
    };

    const sweepFiles = async (protectedNames, cutoff, summary) => {
        if (!protectedNames) return;
        await fs.mkdir(uploadsRoot, { recursive: true });
        for (const entry of await fs.readdir(uploadsRoot, { withFileTypes: true })) {
            if (!entry.isFile() || protectedNames.has(entry.name)) continue;
            const filePath = path.join(uploadsRoot, entry.name);
            try {
                if ((await fs.stat(filePath)).mtimeMs < cutoff) {
                    await fs.rm(filePath, { force: true });
                    summary.files++;
                }
            } catch (error) {
                if (error.code !== "ENOENT") logger.error("file_cleanup_failed", { error });
            }
        }
    };

    const sweepTempDirs = async (cutoff, summary) => {
        for (const entry of await fs.readdir(systemTempRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || !TEMP_PREFIXES.some(prefix => entry.name.startsWith(prefix))) continue;
            const directory = path.resolve(systemTempRoot, entry.name);
            if (path.dirname(directory) !== systemTempRoot) continue;
            try {
                const stats = await fs.lstat(directory);
                if (stats.isSymbolicLink() || !stats.isDirectory()) continue;
                if (stats.mtimeMs < cutoff) {
                    await fs.rm(directory, { recursive: true, force: true });
                    summary.directories++;
                }
            } catch (error) {
                if (error.code !== "ENOENT") logger.error("temporary_directory_cleanup_failed", { error });
            }
        }
    };

    const sweep = () => {
        if (sweepPromise) return sweepPromise;
        if (jobs.size) {
            pendingSweep = true;
            return Promise.resolve({ skippedActive: true, files: 0, directories: 0 });
        }
        sweepPromise = (async () => {
            const summary = { skippedActive: false, files: 0, directories: 0 };
            const cutoff = Date.now() - ttlMs;
            let permanentNames;
            let lookupTimer;
            try {
                permanentNames = new Set(await Promise.race([
                    Promise.resolve().then(getPermanentNames),
                    new Promise((_, reject) => {
                        lookupTimer = setTimeout(() => reject(new Error("Permanent-file lookup timed out")), PERMANENT_LOOKUP_TIMEOUT_MS);
                    }),
                ]));
                databaseWarningShown = false;
            } catch (error) {
                // The database identifies permanent /files/upload entries. Fail closed.
                if (!databaseWarningShown) logger.warn("permanent_file_lookup_failed", { error });
                databaseWarningShown = true;
            } finally {
                clearTimeout(lookupTimer);
            }
            await sweepFiles(permanentNames, cutoff, summary);
            await sweepTempDirs(cutoff, summary);
            try { summary.r2Objects = await sweepR2(); }
            catch (error) { logger.error("r2_cleanup_failed", { error }); }
            return summary;
        })().finally(() => { sweepPromise = undefined; });
        return sweepPromise;
    };

    const beginJob = async () => {
        while (sweepPromise) await sweepPromise;
        const job = { outputs: new Set(), processing: false, responseDone: false, failed: false };
        jobs.add(job);
        return job;
    };

    const finishJob = async (job, { failed = false, inputPaths = [] } = {}) => {
        if (!jobs.has(job)) return;
        if (failed) {
            const paths = [...inputPaths, ...job.outputs].filter(Boolean).map(filePath => path.resolve(filePath));
            await Promise.all(paths.filter(insideUploads).map(filePath =>
                fs.rm(filePath, { force: true }).catch(error => logger.error("failed_job_cleanup_failed", { error }))
            ));
        }
        jobs.delete(job);
        if (pendingSweep && !jobs.size) {
            pendingSweep = false;
            await sweep();
        }
    };

    const trackRequest = (req, res, next) => {
        beginJob().then(job => {
            req.cleanupJob = job;
            let finished = false;
            job.finishIfReady = () => {
                if (finished || !job.responseDone || job.processing) return;
                finished = true;
                const inputPaths = [...(req.files || []), ...(req.file ? [req.file] : [])]
                    .map(file => file.path).filter(Boolean);
                void finishJob(job, { failed: job.failed, inputPaths }).catch(error => logger.error("request_cleanup_failed", { error }));
            };
            const responseDone = (failed) => {
                job.responseDone = true;
                job.failed = failed;
                job.finishIfReady();
            };
            res.once("finish", () => responseDone(res.statusCode >= 400));
            res.once("close", () => {
                if (!job.responseDone) responseDone(!res.writableFinished || res.statusCode >= 400);
            });
            next();
        }).catch(next);
    };

    const trackProcessing = (handler) => async (req, res, next) => {
        const job = req.cleanupJob;
        if (job) job.processing = true;
        try {
            return await handler(req, res, next);
        } finally {
            if (job) {
                job.processing = false;
                job.finishIfReady?.();
            }
        }
    };

    const start = () => {
        if (!timer) {
            timer = setInterval(() => { void sweep().catch(error => logger.error("scheduled_cleanup_failed", { error })); }, Math.min(ttlMs, 60 * 1000));
            timer.unref?.();
        }
        return sweep();
    };

    const stop = () => {
        if (timer) clearInterval(timer);
        timer = undefined;
    };

    return { registerOutput, sweep, beginJob, finishJob, trackRequest, trackProcessing, start, stop };
};

const cleanup = createCleanupService();
module.exports = { ...cleanup, createCleanupService, DEFAULT_TTL_MS, TEMP_PREFIXES };
