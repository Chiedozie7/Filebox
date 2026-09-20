const ocrService = require("../services/ocrService");

const extractTextFromImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No image uploaded",
            });
        }

        const lang = req.body.lang || "eng";

        const result = await ocrService.extractTextFromImage(
            req.file.path,
            lang
        );

        res.json({
            message: "Text extracted successfully",
            original: req.file.filename,
            text: result.text,
            confidence: result.confidence,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to extract text from image",
        });
    }
};

module.exports = {
    extractTextFromImage,
};
