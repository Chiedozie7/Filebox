const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const officeConversionService = require("./officeConversionService");

const execFileAsync = promisify(execFile);
const convertPptxToPdf = (inputPath, outputDir) =>
    officeConversionService.convertToPdf(inputPath, outputDir);

const convertPdfToPptx = async (inputPath, outputPath) => {
    const script = path.join(__dirname, "..", "scripts", "pdf_to_pptx.py");
    const { stdout } = await execFileAsync("python", [script, inputPath, outputPath], {
        timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    });
    // PyMuPDF may print an optional layout-package notice before our result.
    const metadata = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    return { outputPath, ...metadata };
};

module.exports = { convertPptxToPdf, convertPdfToPptx };
