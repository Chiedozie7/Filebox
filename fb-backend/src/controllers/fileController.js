const fileService = require("../services/fileService");
const path = require("path");
const fs = require("fs");
const os = require("os");
const imageService = require("../services/imageService");
const pdfService = require("../services/pdfService");
const wordService = require("../services/wordService");
const excelService = require("../services/excelService");
const zipService = require("../services/zipService");
const temporaryFileCleanup = require("../services/temporaryFileCleanup");
const logger = require("../services/logger");


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
        logger.error("controller_failed", { controller: "fileController", error });
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
        logger.error("controller_failed", { controller: "fileController", error });
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
        temporaryFileCleanup.registerOutput(req, outputPath);

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
        logger.error("controller_failed", { controller: "fileController", error });
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

        if ((width === undefined && height === undefined) ||
            [width, height].some(value => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))) {
            return res.status(400).json({
                error: "Width or height must be a positive integer",
            });
        }

        const outputName = `resized-${req.file.filename}`;
        const outputPath = path.join("uploads", outputName);
        temporaryFileCleanup.registerOutput(req, outputPath);

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
        logger.error("controller_failed", { controller: "fileController", error });
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
        temporaryFileCleanup.registerOutput(req, outputPath);

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
        logger.error("controller_failed", { controller: "fileController", error });

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
        temporaryFileCleanup.registerOutput(req, outputPath);
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
        logger.error("controller_failed", { controller: "fileController", error });
        res.status(500).json({
            error: "Failed to compress PDF",
        });
    }
};

const unlockPDF = async (req, res) => {
    let outputPath;
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No PDF uploaded" });
        }
        if (path.extname(req.file.originalname).toLowerCase() !== ".pdf") {
            return res.status(400).json({ error: "Uploaded file must be a PDF" });
        }
        if (req.body.password !== undefined && typeof req.body.password !== "string") {
            return res.status(400).json({ error: "Password must be text" });
        }

        const outputName = `unlocked-${Date.now()}.pdf`;
        outputPath = path.join("uploads", outputName);
        temporaryFileCleanup.registerOutput(req, outputPath);
        await pdfService.unlockPDF(req.file.path, outputPath, req.body.password || "");
        res.json({
            message: "PDF unlocked successfully",
            original: req.file.filename,
            unlocked: outputName,
        });
    } catch (error) {
        if (outputPath) {
            await fs.promises.rm(outputPath, { force: true }).catch(() => {});
        }
        if (error.code === "INCORRECT_PASSWORD") {
            return res.status(401).json({ error: "Incorrect PDF password" });
        }
        if (error.code === "PASSWORD_REQUIRED") {
            return res.status(400).json({ error: "Password is required for this PDF" });
        }
        if (error.code === "INVALID_PDF") {
            return res.status(400).json({ error: "Uploaded file is not a valid PDF" });
        }
        logger.error("controller_failed", { controller: "fileController", error });
        res.status(500).json({ error: "Failed to unlock PDF" });
    }
};

const mergePDFs = async (req, res) => {
    try {
        if (!req.files || req.files.length < 2) {
            return res.status(400).json({
                error: "At least two files are required",
            });
        }

        const imageFormats = ["jpg", "jpeg", "png", "webp", "avif", "tiff"];
        const extensions = req.files.map((file) =>
            path.extname(file.originalname).toLowerCase().slice(1)
        );
        for (const [index, extension] of extensions.entries()) {
            if (!["pdf", "docx", "xlsx", ...imageFormats].includes(extension)) {
                return res.status(400).json({
                    error: `Unsupported file type: ${extension || "unknown"}`,
                });
            }
            if (imageFormats.includes(extension)) {
                let validImage = false;
                try {
                    validImage = await imageService.isSupportedStaticImage(
                        req.files[index].path,
                        extension === "jpg" ? "jpeg" : extension
                    );
                } catch {
                    // Invalid image data is a bad upload, not a merge failure.
                }
                if (!validImage) {
                    return res.status(400).json({
                        error: "Uploaded image must be a supported static image",
                    });
                }
            }
        }

        const outputName = `merged-${Date.now()}.pdf`;
        const outputPath = path.join("uploads", outputName);
        temporaryFileCleanup.registerOutput(req, outputPath);
        const temporaryDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), "fileforge-mixed-merge-")
        );
        try {
            const pdfPaths = [];
            for (const [index, file] of req.files.entries()) {
                const extension = extensions[index];
                if (extension === "pdf") {
                    pdfPaths.push(file.path);
                } else if (extension === "docx") {
                    const result = await wordService.convertWordToPdf(file.path, temporaryDir);
                    pdfPaths.push(result.outputPath);
                } else if (extension === "xlsx") {
                    const result = await excelService.convertExcelToPdf(file.path, temporaryDir);
                    pdfPaths.push(result.outputPath);
                } else {
                    const pngPath = path.join(temporaryDir, `${index}.png`);
                    const pdfPath = path.join(temporaryDir, `${index}.pdf`);
                    await imageService.convertImage(file.path, pngPath, "png");
                    await pdfService.convertPngToPdf(pngPath, pdfPath);
                    pdfPaths.push(pdfPath);
                }
            }
            await pdfService.mergePDFs(pdfPaths, outputPath);
        } finally {
            await fs.promises.rm(temporaryDir, { recursive: true, force: true });
        }

        res.json({
            message: "Files merged successfully",
            files: req.files.map(
                (file) => file.filename
            ),
            merged: outputName,
        });
    } catch (error) {
        logger.error("controller_failed", { controller: "fileController", error });

        res.status(500).json({
            error: "Failed to merge files into PDF",
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

        if (!Number.isSafeInteger(startPage) || !Number.isSafeInteger(endPage) ||
            startPage < 1 || endPage < startPage) {
            return res.status(400).json({
                error:
                    "Start page and end page must be positive integers in ascending order",
            });
        }

        const outputName =
            `split-${Date.now()}.pdf`;

        const outputPath = path.join(
            "uploads",
            outputName
        );
        temporaryFileCleanup.registerOutput(req, outputPath);

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
        logger.error("controller_failed", { controller: "fileController", error });

        res.status(error.code === "INVALID_PAGE_RANGE" ? 400 : 500).json({
            error: error.code === "INVALID_PAGE_RANGE" ? "Invalid page range" : "Failed to split PDF",
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
        temporaryFileCleanup.registerOutput(req, path.join(outputDir, `${path.parse(req.file.filename).name}.pdf`));

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
        logger.error("controller_failed", { controller: "fileController", error });

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
        temporaryFileCleanup.registerOutput(req, outputPath);
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
        logger.error("controller_failed", { controller: "fileController", error });
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
        temporaryFileCleanup.registerOutput(req, path.join(outputDir, `${path.parse(req.file.filename).name}.pdf`));

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
        logger.error("controller_failed", { controller: "fileController", error });

        res.status(500).json({
            error: "Failed to convert Excel document to PDF",
        });
    }
};

const convertExcelToWord = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No Excel document uploaded" });
        }
        if (path.extname(req.file.originalname).toLowerCase() !== ".xlsx") {
            return res.status(400).json({ error: "Uploaded file must be an XLSX document" });
        }

        const outputName = `converted-${Date.now()}.docx`;
        const outputPath = path.join("uploads", outputName);
        temporaryFileCleanup.registerOutput(req, outputPath);
        const result = await excelService.convertExcelToWord(req.file.path, outputPath);
        res.json({
            message: "Excel document converted to Word successfully",
            original: req.file.filename,
            converted: outputName,
            worksheetsFound: result.worksheetCount,
        });
    } catch (error) {
        logger.error("controller_failed", { controller: "fileController", error });
        res.status(500).json({ error: "Failed to convert Excel document to Word" });
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
        logger.error("controller_failed", { controller: "fileController", error });
        res.status(500).json({
            error: "Failed to download file",
        });
    }
};

const batchConvertFiles = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: "No files uploaded",
            });
        }

        const format = req.body.format?.toLowerCase();
        const imageFormats = [
            "jpeg",
            "jpg",
            "png",
            "webp",
            "avif",
            "tiff",
        ];

        if (!format || ![...imageFormats, "pdf", "docx", "xlsx"].includes(format)) {
            return res.status(400).json({
                error: "Unsupported output format",
            });
        }

        const outputFormat = format === "jpg" ? "jpeg" : format;
        const outputExtension = format === "jpeg" ? "jpg" : format;
        const officeConversions = {
            pdf: ["docx", "xlsx"],
            docx: ["pdf", "xlsx"],
            xlsx: ["pdf", "docx"],
        };
        const sources = req.files.map((file) => {
            const extension = path.extname(file.originalname).toLowerCase().slice(1);
            return extension === "jpg" ? "jpeg" : extension;
        });

        for (const source of sources) {
            const supported = imageFormats.includes(source)
                ? imageFormats.includes(outputFormat)
                : officeConversions[source]?.includes(outputFormat);
            if (!supported) {
                return res.status(400).json({
                    error: `Unsupported conversion: ${source || "unknown"} to ${outputFormat}`,
                });
            }
        }

        const convertedPaths = [];

        for (const [index, file] of req.files.entries()) {
            const outputName =
                `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.${outputExtension}`;
            const outputPath = path.join("uploads", outputName);
            temporaryFileCleanup.registerOutput(req, outputPath);
            const source = sources[index];
            if ((source === "docx" || source === "xlsx") && outputFormat === "pdf") {
                temporaryFileCleanup.registerOutput(req, path.join("uploads", `${path.parse(file.filename).name}.pdf`));
            }
            let result;

            if (imageFormats.includes(source)) {
                await imageService.convertImage(file.path, outputPath, outputFormat);
            } else if (source === "pdf" && outputFormat === "docx") {
                result = await pdfService.convertPdfToWord(file.path, outputPath);
            } else if (source === "pdf" && outputFormat === "xlsx") {
                result = await pdfService.convertPdfToExcel(file.path, outputPath);
            } else if (source === "docx" && outputFormat === "pdf") {
                result = await wordService.convertWordToPdf(file.path, "uploads");
            } else if (source === "docx" && outputFormat === "xlsx") {
                result = await wordService.convertWordToExcel(file.path, outputPath);
            } else if (source === "xlsx" && outputFormat === "pdf") {
                result = await excelService.convertExcelToPdf(file.path, "uploads");
            } else if (source === "xlsx" && outputFormat === "docx") {
                result = await excelService.convertExcelToWord(file.path, outputPath);
            }

            convertedPaths.push(result?.outputPath || outputPath);
        }

        const zipName = `batch-${Date.now()}.zip`;
        const zipPath = path.join("uploads", zipName);
        temporaryFileCleanup.registerOutput(req, zipPath);

        await zipService.createZip(convertedPaths, zipPath);

        res.json({
            message: "Batch conversion completed",
            filesConverted: convertedPaths.length,
            zip: zipName,
        });
    } catch (error) {
        logger.error("controller_failed", { controller: "fileController", error });
        res.status(500).json({
            error: "Failed to batch convert files",
        });
    }
};

const zipFiles = async (req, res) => {
    let outputPath;
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No files uploaded" });
        }

        const supportedImages = ["jpg", "jpeg", "png", "webp", "avif", "tiff"];
        const supported = ["pdf", "docx", "xlsx", ...supportedImages];
        const entryNames = [];
        const usedNames = new Map();

        for (const file of req.files) {
            const extension = path.extname(file.originalname).toLowerCase().slice(1);
            if (!supported.includes(extension)) {
                return res.status(400).json({
                    error: `Unsupported file type: ${extension || "unknown"}`,
                });
            }
            if (supportedImages.includes(extension)) {
                let validImage = false;
                try {
                    validImage = await imageService.isSupportedStaticImage(
                        file.path,
                        extension === "jpg" ? "jpeg" : extension
                    );
                } catch {
                    validImage = false;
                }
                if (!validImage) {
                    return res.status(400).json({
                        error: "Uploaded image must be a supported static image",
                    });
                }
            }

            const originalName = path.basename(file.originalname);
            const parsed = path.parse(originalName);
            const count = usedNames.get(originalName) || 0;
            let entryName = originalName;
            if (count > 0) {
                entryName = `${parsed.name} (${count + 1})${parsed.ext}`;
                while (usedNames.has(entryName)) {
                    const nextCount = usedNames.get(originalName) + 1;
                    usedNames.set(originalName, nextCount);
                    entryName = `${parsed.name} (${nextCount + 1})${parsed.ext}`;
                }
            }
            usedNames.set(originalName, count + 1);
            usedNames.set(entryName, usedNames.get(entryName) || 1);
            entryNames.push(entryName);
        }

        const zipName = `files-${Date.now()}.zip`;
        outputPath = path.join("uploads", zipName);
        temporaryFileCleanup.registerOutput(req, outputPath);
        await zipService.createZip(
            req.files.map((file) => file.path),
            outputPath,
            entryNames
        );

        res.json({
            message: "Files zipped successfully",
            files: entryNames,
            zip: zipName,
        });
    } catch (error) {
        if (outputPath) {
            await fs.promises.rm(outputPath, { force: true }).catch(() => {});
        }
        logger.error("controller_failed", { controller: "fileController", error });
        res.status(500).json({ error: "Failed to create ZIP" });
    }
};

module.exports = {
    uploadFile,
    getFiles,
    compressImage,
    resizeImage,
    convertImage,
    compressPDF,
    unlockPDF,
    mergePDFs,
    splitPDF,
    convertWordToPdf,
    convertWordToExcel,
    convertExcelToPdf,
    convertExcelToWord,
    downloadFile,
    batchConvertFiles,
    zipFiles,
};
