const officeConversionService = require("./officeConversionService");

const convertWordToPdf = (inputPath, outputDir) => {
    return officeConversionService.convertToPdf(inputPath, outputDir);
};

module.exports = {
    convertWordToPdf,
}; 
