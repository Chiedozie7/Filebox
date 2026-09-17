const { PDFDocument } = require("pdf-lib");
const { execFile } = require("child_process");
const util = require("util");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const execFileAsync = util.promisify(execFile);


const mergePDFs = async (inputPaths, outputPath) => {
    const mergedPdf = await PDFDocument.create();

    for (const inputPath of inputPaths) {
        const pdfBytes = fs.readFileSync(inputPath);
        const pdf = await PDFDocument.load(pdfBytes);

        const pages = await mergedPdf.copyPages(
            pdf,
            pdf.getPageIndices()
        );

        pages.forEach((page) => {
            mergedPdf.addPage(page);
        });
    }

    const mergedBytes = await mergedPdf.save();

    fs.writeFileSync(outputPath, mergedBytes);
};

const splitPDF = async (
    inputPath,
    outputPath,
    startPage,
    endPage
) => {
    const pdfBytes = fs.readFileSync(inputPath);
    const pdf = await PDFDocument.load(pdfBytes);

    const pageCount = pdf.getPageCount();

    const startIndex = startPage - 1;
    const endIndex = endPage - 1;

    if (
        startIndex < 0 ||
        endIndex >= pageCount ||
        startIndex > endIndex
    ) {
        throw new Error("Invalid page range");
    }

    const newPdf = await PDFDocument.create();

    const pageIndices = [];

    for (
        let i = startIndex;
        i <= endIndex;
        i++
    ) {
        pageIndices.push(i);
    }

    const pages = await newPdf.copyPages(
        pdf,
        pageIndices
    );

    pages.forEach((page) => {
        newPdf.addPage(page);
    });

    const newBytes = await newPdf.save();

    fs.writeFileSync(outputPath, newBytes);
};

const SCRIPTS_DIR = path.join(
    __dirname,
    "..",
    "scripts"
);

const convertPdfToWord = async (
    inputPath,
    outputPath
) => {
    const scriptPath = path.join(
        SCRIPTS_DIR,
        "pdf_to_docx.py"
    );

    try {
        await execFileAsync(
            "python",
            [
                scriptPath,
                inputPath,
                outputPath,
            ],
            {
                timeout: 60000,
            }
        );
    }  catch (error) {
        console.error("PDF to Word stderr:", error.stderr);
        throw new Error(
            `PDF to Word conversion failed: ${error.message}`
        );
    }

if (!fs.existsSync(outputPath)) {
    throw new Error(
        "Conversion completed but output file was not created"
    );
}

return { outputPath };
};

const extractTablesFromPdf = async (inputPath) => {
    const scriptPath = path.join(
        SCRIPTS_DIR,
        "pdf_to_tables.py"
    );

    let stdout;

    try {
        ({ stdout } = await execFileAsync(
            "python",
            [
                scriptPath,
                inputPath,
            ],
            {
                timeout: 60000,
                maxBuffer: 1024 * 1024 * 20,
            }
        ));
    } catch (error) {
        throw new Error(
            `Table extraction failed: ${error.message}`
        );
    }

    try {
        return JSON.parse(stdout);
    } catch {
        throw new Error(
            "Table extraction returned invalid data"
        );
    }
};


const convertPdfToExcel = async (
    inputPath,
    outputPath
) => {
    const pages =
        await extractTablesFromPdf(inputPath);

    const workbook =
        new ExcelJS.Workbook();

    let tableCount = 0;

    pages.forEach(({ page, tables }) => {
        tables.forEach((table, tableIndex) => {
            tableCount += 1;

            const sheet =
                workbook.addWorksheet(
                    `Page${page}_Table${tableIndex + 1}`
                        .slice(0, 31)
                );

            table.forEach((row) => {
                sheet.addRow(
                    row.map((cell) =>
                        cell === null
                            ? ""
                            : cell
                    )
                );
            });
        });
    });

    if (tableCount === 0) {
        const sheet =
            workbook.addWorksheet(
                "No tables found"
            );

        sheet.addRow([
            "No tables were detected in this PDF.",
        ]);
    }

    await workbook.xlsx.writeFile(
        outputPath
    );

    return {
        outputPath,
        tableCount,
    };
};


module.exports = {
    mergePDFs,
    splitPDF,
    convertPdfToWord,
    convertPdfToExcel,
};