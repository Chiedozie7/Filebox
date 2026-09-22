const fileService = require("../services/fileService");
const path = require("path");
const fs = require("fs");
const imageService = require("../services/imageService");
const pdfService = require("../services/pdfService");
const wordService = require("../services/wordService");
const excelService = require("../services/excelService");
const zipService = require("../services/zipService");


const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No file uploaded",
            });
        }

        const file = await fileService.saveFile(req.file);

        res.status(201).json(file);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to upload file",
        });
    }
};

const getFiles = async (req, res) => {
    try {
        const files = await fileService.getFiles();

        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to retrieve files",
        });
    }
};

const compressImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No image uploaded",
            });
        }
        const extension = path.extname(req.file.originalname).toLowerCase();
        const format = imageService.getImageFormat(req.file.originalname);

        const outputExtension = format === "jpeg" ? "jpg" : format;
        const outputName = `compressed-${Date.now()}.${outputExtension}`;
        const outputPath = path.join("uploads", outputName);

        const compressionResult = await imageService.compressImage(
            req.file.path,
            outputPath,
            format
        );

        res.json({
            message: "Image compressed successfully",
            original: req.file.filename,
            compressed: outputName,
            ...compressionResult,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to compress image",
        });
    }
};

const resizeImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No image uploaded",
            });
        }

        const width = req.body.width
            ? Number(req.body.width)
            : undefined;

        const height = req.body.height
            ? Number(req.body.height)
            : undefined;

        if (!width && !height) {
            return res.status(400).json({
                error: "Width or height is required",
            });
        }

        const outputName = `resized-${req.file.filename}`;
        const outputPath = path.join("uploads", outputName);

        const resizeResult = await imageService.resizeImage(
            req.file.path,
            outputPath,
            width,
            height
        );

        res.json({
            message: "Image resized successfully",
            original: req.file.filename,
            resized: outputName,
            ...resizeResult,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to resize image",
        });
    }
};

const convertImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No file uploaded",
            });
        }

        const format = req.body.format?.toLowerCase();

        const supportedFormats = [
            "jpeg",
            "jpg",
            "png",
            "webp",
            "avif",
            "tiff",
            "gif",
        ];

        if (!format || !supportedFormats.includes(format)) {
            return res.status(400).json({
                error: "Unsupported output format",
            });
        }

        const outputFormat = format === "jpg" ? "jpeg" : format;
        const outputExtension = format === "jpeg" ? "jpg" : format;

        const outputName = `converted-${Date.now()}.${outputExtension}`;
        const outputPath = path.join("uploads", outputName);

        await imageService.convertImage(
            req.file.path,
            outputPath,
            outputFormat
        );

        res.json({
            message: "Image converted successfully",
            original: req.file.filename,
            converted: outputName,
            format: outputFormat,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to convert image",
        });
    }
};

const compressPDF = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No PDF uploaded",
            });
        }

        if (path.extname(req.file.originalname).toLowerCase() !== ".pdf") {
            return res.status(400).json({
                error: "Uploaded file must be a PDF",
            });
        }

        const outputName = `compressed-${Date.now()}.pdf`;
        const outputPath = path.join("uploads", outputName);
        const compressionResult = await pdfService.compressPDF(
            req.file.path,
            outputPath
        );

        res.json({
            message: "PDF compressed successfully",
            original: req.file.filename,
            compressed: outputName,
            ...compressionResult,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to compress PDF",
        });
    }
};

const mergePDFs = async (req, res) => {
    try {
        if (!req.files || req.files.length < 2) {
            return res.status(400).json({
                error: "At least two PDF files are required",
            });
        }

        const invalidFile = req.files.find(
            (file) =>
                path.extname(file.originalname)
                    .toLowerCase() !== ".pdf"
        );

        if (invalidFile) {
            return res.status(400).json({
                error: "All uploaded files must be PDFs",
            });
        }

        const outputName =
            `merged-${Date.now()}.pdf`;

        const outputPath = path.join(
            "uploads",
            outputName
        );

        await pdfService.mergePDFs(
            req.files.map((file) => file.path),
            outputPath
        );

        res.json({
            message: "PDFs merged successfully",
            files: req.files.map(
                (file) => file.filename
            ),
            merged: outputName,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to merge PDFs",
        });
    }
};

const splitPDF = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No PDF uploaded",
            });
        }

        if (
            path.extname(req.file.originalname)
                .toLowerCase() !== ".pdf"
        ) {
            return res.status(400).json({
                error: "Uploaded file must be a PDF",
            });
        }

        const startPage = Number(
            req.body.startPage
        );

        const endPage = Number(
            req.body.endPage
        );

        if (!startPage || !endPage) {
            return res.status(400).json({
                error:
                    "Start page and end page are required",
            });
        }

        const outputName =
            `split-${Date.now()}.pdf`;

        const outputPath = path.join(
            "uploads",
            outputName
        );

        await pdfService.splitPDF(
            req.file.path,
            outputPath,
            startPage,
            endPage
        );

        res.json({
            message:
                "PDF split successfully",
            original: req.file.filename,
            split: outputName,
            startPage,
            endPage,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to split PDF",
        });
    }
};


const convertWordToPdf = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No Word document uploaded",
            });
        }

        if (
            path.extname(req.file.originalname)
                .toLowerCase() !== ".docx"
        ) {
            return res.status(400).json({
                error: "Uploaded file must be a DOCX document",
            });
        }

        const outputDir = "uploads";

        const result =
            await wordService.convertWordToPdf(
                req.file.path,
                outputDir
            );

        res.json({
            message:
                "Word document converted to PDF successfully",
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

const convertWordToExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No Word document uploaded",
            });
        }

        if (path.extname(req.file.originalname).toLowerCase() !== ".docx") {
            return res.status(400).json({
                error: "Uploaded file must be a DOCX document",
            });
        }

        const outputName = `converted-${Date.now()}.xlsx`;
        const outputPath = path.join("uploads", outputName);
        const result = await wordService.convertWordToExcel(
            req.file.path,
            outputPath
        );

        res.json({
            message: "Word document converted to Excel successfully",
            original: req.file.filename,
            converted: outputName,
            tablesFound: result.tableCount,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to convert Word document to Excel",
        });
    }
};

const convertExcelToPdf = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No Excel document uploaded",
            });
        }

        if (
            path.extname(req.file.originalname)
                .toLowerCase() !== ".xlsx"
        ) {
            return res.status(400).json({
                error: "Uploaded file must be an XLSX document",
            });
        }

        const outputDir = "uploads";

        const result =
            await excelService.convertExcelToPdf(
                req.file.path,
                outputDir
            );

        res.json({
            message:
                "Excel document converted to PDF successfully",
            original: req.file.filename,
            converted: path.basename(result.outputPath),
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Failed to convert Excel document to PDF",
        });
    }
};

// --- New below ---

const downloadFile = (req, res) => {
    try {
        // path.basename strips any directory traversal (../, absolute paths)
        const filename = path.basename(req.params.filename);
        const filePath = path.join("uploads", filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                error: "File not found",
            });
        }

        res.download(filePath, filename);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to download file",
        });
    }
};

const batchConvertImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: "No images uploaded",
            });
        }

        const format = req.body.format?.toLowerCase();

        const supportedFormats = [
            "jpeg",
            "jpg",
            "png",
            "webp",
            "avif",
            "tiff",
            "gif",
        ];

        if (!format || !supportedFormats.includes(format)) {
            return res.status(400).json({
                error: "Unsupported output format",
            });
        }

        const outputFormat = format === "jpg" ? "jpeg" : format;
        const outputExtension = format === "jpeg" ? "jpg" : format;

        const convertedPaths = [];

        for (const file of req.files) {
            const outputName =
                `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.${outputExtension}`;
            const outputPath = path.join("uploads", outputName);

            await imageService.convertImage(
                file.path,
                outputPath,
                outputFormat
            );

            convertedPaths.push(outputPath);
        }

        const zipName = `batch-${Date.now()}.zip`;
        const zipPath = path.join("uploads", zipName);

        await zipService.createZip(convertedPaths, zipPath);

        res.json({
            message: "Batch conversion completed",
            filesConverted: convertedPaths.length,
            zip: zipName,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to batch convert images",
        });
    }
};

module.exports = {
    uploadFile,
    getFiles,
    compressImage,
    resizeImage,
    convertImage,
    compressPDF,
    mergePDFs,
    splitPDF,
    convertWordToPdf,
    convertWordToExcel,
    convertExcelToPdf,
    downloadFile,
    batchConvertImages,
};
