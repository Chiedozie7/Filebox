const Tesseract = require("tesseract.js");

const extractTextFromImage = async (inputPath, lang = "eng") => {
    const { data } = await Tesseract.recognize(inputPath, lang);

    return {
        text: data.text,
        confidence: data.confidence,
    };
};

module.exports = {
    extractTextFromImage,
};
