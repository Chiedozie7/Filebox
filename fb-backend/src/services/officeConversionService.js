const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const os = require("os");
const logger = require("./logger");

const execFileAsync = util.promisify(execFile);

const SOFFICE_PATH =
    process.env.SOFFICE_PATH ||
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

/**
 * Converts any LibreOffice-supported document (docx, xlsx, pptx, etc.)
 * to PDF using headless soffice.
 */
// One profile, created lazily on first use and reused for the life of
// the app. Isolates us from any other LibreOffice instance on the
// machine (the original goal) without paying LibreOffice's slow
// first-run profile initialization cost on every single conversion —
// which was likely exceeding the timeout below and causing the silent
// failures.
const PROFILE_DIR = path.join(os.tmpdir(), "filebox-lo-profile");
const PROFILE_URI = `file:///${PROFILE_DIR.replace(/\\/g, "/")}`;
const CONVERSION_TIMEOUT_MS = 120000;
const WARMUP_TIMEOUT_MS = 35000;

const performConversion = async (inputPath, outputDir, { timeout = CONVERSION_TIMEOUT_MS, signal, warmup = false } = {}) => {
    try {
        await execFileAsync(
            SOFFICE_PATH,
            [
                `-env:UserInstallation=${PROFILE_URI}`,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                outputDir,
                inputPath,
            ],
            {
                timeout,
                signal,
            }
        );
    } catch (error) {
        if (warmup) throw error;
        // These were previously swallowed — this is what actually tells
        // you why soffice exited non-zero.
        logger.error("libreoffice_conversion_failed", {
            error,
            exitCode: error.code,
            killed: Boolean(error.killed),
            signal: error.signal,
        });
        const failure = new Error("Conversion to PDF failed");
        failure.code = error.code;
        throw failure;
    }

    const inputName = path.basename(inputPath);
    const baseName = inputName.replace(/\.[^.]+$/, "");
    const outputPath = path.join(outputDir, `${baseName}.pdf`);

    if (!fs.existsSync(outputPath)) {
        throw new Error("Conversion completed but PDF was not created");
    }

    return { outputPath };
};

// Heavy batches and very-heavy routes share one LibreOffice profile. Concurrent
// launches against it can exit before producing their output or fail outright.
let previousConversion = Promise.resolve();
let activeWarmup = null;
const queueConversion = (task) => {
    const conversion = previousConversion.then(task);
    previousConversion = conversion.catch(() => {});
    return conversion;
};
const convertToPdf = (inputPath, outputDir) => {
    if (activeWarmup && !activeWarmup.controller.signal.aborted) {
        activeWarmup.preempted = true;
        activeWarmup.controller.abort();
    }
    return queueConversion(() => performConversion(inputPath, outputDir));
};

const warmUp = () => {
    if (activeWarmup) return activeWarmup.promise;
    const state = { controller: new AbortController(), preempted: false, timedOut: false };
    activeWarmup = state;
    const timer = setTimeout(() => {
        state.timedOut = true;
        state.controller.abort();
    }, WARMUP_TIMEOUT_MS);
    const abortedResult = () => {
        if (state.preempted) return { skipped: true };
        const error = new Error("LibreOffice warm-up timed out after 35 seconds");
        error.code = "WARMUP_TIMEOUT";
        throw error;
    };
    state.promise = queueConversion(async () => {
        if (state.controller.signal.aborted) return abortedResult();
        const temporaryDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "filebox-lo-warmup-"));
        try {
            if (state.controller.signal.aborted) return abortedResult();
            const inputPath = path.join(temporaryDir, "warmup.txt");
            await fsPromises.writeFile(inputPath, "FileBox LibreOffice warm-up\n", "utf8");
            if (state.controller.signal.aborted) return abortedResult();
            await performConversion(inputPath, temporaryDir, {
                timeout: WARMUP_TIMEOUT_MS,
                signal: state.controller.signal,
                warmup: true,
            });
            return { skipped: false };
        } catch (error) {
            if (state.controller.signal.aborted) return abortedResult();
            if (error?.killed) {
                state.timedOut = true;
                return abortedResult();
            }
            throw error;
        } finally {
            await fsPromises.rm(temporaryDir, { recursive: true, force: true });
        }
    }).finally(() => {
        clearTimeout(timer);
        if (activeWarmup === state) activeWarmup = null;
    });
    return state.promise;
};

module.exports = {
    convertToPdf,
    warmUp,
};
