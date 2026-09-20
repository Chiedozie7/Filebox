const path = require("path");
const wordService = require("../services/wordService");

const convertWordToPdf = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No Word document uploaded",
            });
        }

        if (
            path.extname(req.file.originalname).toLowerCase() !== ".docx"
        ) {
            return res.status(400).json({
                error: "Uploaded file must be a DOCX document",
            });
        }

        const outputDir = "uploads";

        const result = await wordService.convertWordToPdf(
            req.file.path,
            outputDir
        );

        res.json({
            message: "Word document converted to PDF successfully",
            original: req.file.filename,
            converted: path.basename(result.outputPath),
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to convert Word document to PDF",
        });
    }
};

module.exports = {
    convertWordToPdf,
};