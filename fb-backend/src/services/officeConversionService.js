const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");

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

const convertToPdf = async (inputPath, outputDir) => {
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
        console.error("LibreOffice stdout:", error.stdout);
        console.error("LibreOffice stderr:", error.stderr);
        console.error("LibreOffice exit code:", error.code);
        console.error("LibreOffice killed by timeout:", error.killed);
        console.error("LibreOffice signal:", error.signal);
        throw new Error(`Conversion to PDF failed: ${error.message}`);
    }

    const inputName = path.basename(inputPath);
    const baseName = inputName.replace(/\.[^.]+$/, "");
    const outputPath = path.join(outputDir, `${baseName}.pdf`);

    if (!fs.existsSync(outputPath)) {
        throw new Error("Conversion completed but PDF was not created");
    }

    return { outputPath };
};

module.exports = {
    convertToPdf,
};
