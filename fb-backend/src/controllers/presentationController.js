const path = require("path");
const { uploadDir } = require("../config/uploadDir");
const crypto = require("crypto");
const service = require("../services/presentationService");
const cleanup = require("../services/temporaryFileCleanup");
const logger = require("../services/logger");

const convert = (source, target) => async (req, res) => {
    if (!req.file || path.extname(req.file.originalname).toLowerCase() !== `.${source}`) {
        return res.status(400).json({ error: `Upload one ${source.toUpperCase()} file` });
    }
    const name = source === "pptx" ? `${path.parse(req.file.filename).name}.pdf`
        : `converted-${crypto.randomUUID()}.pptx`;
    const outputPath = path.join(uploadDir, name);
    cleanup.registerOutput(req, outputPath);
    try {
        const result = source === "pptx"
            ? await service.convertPptxToPdf(req.file.path, uploadDir)
            : await service.convertPdfToPptx(req.file.path, outputPath);
        res.json({ message: `${source.toUpperCase()} converted to ${target.toUpperCase()} successfully`,
            original: req.file.filename, converted: name,
            ...(result.slideCount ? { slideCount: result.slideCount, reconstruction: result.reconstruction } : {}) });
    } catch (error) {
        logger.error("presentation_conversion_failed", { source, target, error });
        if (!res.headersSent && !res.destroyed) res.status(500).json({ error: `Failed to convert ${source.toUpperCase()} to ${target.toUpperCase()}` });
    }
};

module.exports = { convertPptxToPdf: convert("pptx", "pdf"), convertPdfToPptx: convert("pdf", "pptx") };
