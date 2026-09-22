const officeConversionService = require("./officeConversionService");
const { execFile } = require("child_process");
const util = require("util");
const path = require("path");
const ExcelJS = require("exceljs");

const execFileAsync = util.promisify(execFile);

const convertWordToPdf = (inputPath, outputDir) => {
    return officeConversionService.convertToPdf(inputPath, outputDir);
};

const convertWordToExcel = async (inputPath, outputPath) => {
    const scriptPath = path.join(__dirname, "..", "scripts", "docx_to_tables.py");
    const { stdout } = await execFileAsync("python", [scriptPath, inputPath], {
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024,
    });
    const tables = JSON.parse(stdout);
    const workbook = new ExcelJS.Workbook();

    tables.forEach(({ rows, merges }, tableIndex) => {
        const sheet = workbook.addWorksheet(`Table${tableIndex + 1}`);
        rows.forEach((row) => sheet.addRow(row));

        sheet.columns.forEach((column) => {
            let longestLineLength = 0;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const lines = String(cell.value ?? "").split(/\r?\n/);
                longestLineLength = Math.max(
                    longestLineLength,
                    ...lines.map((line) => line.length)
                );
                cell.alignment = { wrapText: true, vertical: "top" };
            });
            column.width = Math.min(40, Math.max(10, longestLineLength + 2));
        });

        merges.forEach((range) => sheet.mergeCells(...range));
    });

    if (tables.length === 0) {
        const sheet = workbook.addWorksheet("No tables found");
        sheet.addRow(["No tables were detected in this document."]);
    }

    await workbook.xlsx.writeFile(outputPath);
    return { outputPath, tableCount: tables.length };
};

module.exports = {
    convertWordToPdf,
    convertWordToExcel,
}; 
