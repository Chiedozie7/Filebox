const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs");
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

const performConversion = async (inputPath, outputDir) => {
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
                timeout: 120000, // first-ever run initializes the profile; give it room
            }
        );
    } catch (error) {
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
const convertToPdf = (inputPath, outputDir) => {
    const conversion = previousConversion.then(() => performConversion(inputPath, outputDir));
    previousConversion = conversion.catch(() => {});
    return conversion;
};

module.exports = {
    convertToPdf,
};
