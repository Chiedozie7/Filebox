const path = require("path");
const pdfService = require("../services/pdfService");

const isPdf = (file) =>
    path.extname(file.originalname).toLowerCase() === ".pdf";

const convertPdfToWord = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No PDF uploaded",
            });
        }

        if (!isPdf(req.file)) {
            return res.status(400).json({
                error: "Uploaded file must be a PDF",
            });
        }

        const outputName =
            `converted-${Date.now()}.docx`;

        const outputPath = path.join(
            "uploads",
            outputName
        );

        await pdfService.convertPdfToWord(
            req.file.path,
            outputPath
        );

        res.json({
            message:
                "PDF converted to Word successfully",
            original: req.file.filename,
            converted: outputName,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error:
                "Failed to convert PDF to Word",
        });
    }
};

const convertPdfToExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No PDF uploaded",
            });
        }

        if (!isPdf(req.file)) {
            return res.status(400).json({
                error: "Uploaded file must be a PDF",
            });
        }

        const outputName =
            `converted-${Date.now()}.xlsx`;

        const outputPath = path.join(
            "uploads",
            outputName
        );

        const result =
            await pdfService.convertPdfToExcel(
                req.file.path,
                outputPath
            );

        res.json({
            message:
                "PDF converted to Excel successfully",
            original: req.file.filename,
            converted: outputName,
            tablesFound: result.tableCount,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error:
                "Failed to convert PDF to Excel",
        });
    }
};

module.exports = {
    convertPdfToWord,
    convertPdfToExcel,
};