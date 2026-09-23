const ocrService = require("../services/ocrService");
const imageService = require("../services/imageService");
const fs = require("fs/promises");
const path = require("path");

const convertOcrToWord = async (req, res) => {
    let outputPath;
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No image or PDF uploaded",
            });
        }

        const extension = path.extname(req.file.originalname).toLowerCase().slice(1);
        const imageFormats = ["jpg", "jpeg", "png", "webp", "avif", "tiff"];
        if (extension !== "pdf" && !imageFormats.includes(extension)) {
            return res.status(400).json({
                error: `Unsupported file type: ${extension || "unknown"}`,
            });
        }
        if (imageFormats.includes(extension)) {
            let validImage = false;
            try {
                validImage = await imageService.isSupportedStaticImage(
                    req.file.path,
                    extension === "jpg" ? "jpeg" : extension
                );
            } catch {
                validImage = false;
            }
            if (!validImage) {
                return res.status(400).json({
                    error: "Uploaded image must be a supported static image",
                });
            }
        }

        const lang = req.body.lang || "eng";
        const outputName = `ocr-${Date.now()}.docx`;
        outputPath = path.join("uploads", outputName);
        await ocrService.convertToWord(
            req.file.path,
            outputPath,
            extension === "pdf" ? "pdf" : "image",
            lang
        );

        res.download(outputPath, outputName);
    } catch (error) {
        if (outputPath) {
            await fs.rm(outputPath, { force: true }).catch(() => {});
        }
        console.error(error);
        res.status(500).json({
            error: "Failed to convert OCR to Word",
        });
    }
};

module.exports = {
    convertOcrToWord,
};
