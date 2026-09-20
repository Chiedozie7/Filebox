const officeConversionService = require("./officeConversionService");

const convertExcelToPdf = (inputPath, outputDir) => {
    return officeConversionService.convertToPdf(inputPath, outputDir);
};

module.exports = {
    convertExcelToPdf,
};
