const Tesseract = require("tesseract.js");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const imageService = require("./imageService");

const execFileAsync = promisify(execFile);

const extractTextFromImage = async (inputPath, lang = "eng") => {
    const worker = await Tesseract.createWorker(lang);
    try {
        const { data } = await worker.recognize(inputPath, {}, { text: true, tsv: true });
        return { text: data.text, tsv: data.tsv, confidence: data.confidence };
    } finally {
        await worker.terminate();
    }
};

const convertToWord = async (inputPath, outputPath, sourceType, lang = "eng") => {
    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileforge-ocr-"));
    const scriptPath = path.join(__dirname, "..", "scripts", "ocr_to_docx.py");
    try {
        let imagePaths;
        if (sourceType === "pdf") {
            const { stdout } = await execFileAsync(
                "python",
                [scriptPath, "render-pdf", inputPath, temporaryDir],
                { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
            );
            imagePaths = JSON.parse(stdout);
        } else {
            const pngPath = path.join(temporaryDir, "image.png");
            await imageService.convertImage(inputPath, pngPath, "png");
            imagePaths = [pngPath];
        }

        const pages = [];
        for (const imagePath of imagePaths) {
            const result = await extractTextFromImage(imagePath, lang);
            pages.push({ text: result.text, tsv: result.tsv, imagePath });
        }

        const textPath = path.join(temporaryDir, "pages.json");
        await fs.writeFile(textPath, JSON.stringify(pages), "utf8");
        await execFileAsync(
            "python",
            [scriptPath, "write-docx", textPath, outputPath],
            { timeout: 60000 }
        );
        return { outputPath, pageCount: pages.length };
    } finally {
        await fs.rm(temporaryDir, { recursive: true, force: true });
    }
};

module.exports = {
    extractTextFromImage,
    convertToWord,
};
