const express = require("express");
const upload = require("../middleware/upload");
const {
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
    convertExcelToWord,
    downloadFile,
    batchConvertFiles,
    zipFiles,
} = require("../controllers/fileController");

const {
    convertPdfToWord,
    convertPdfToExcel,
} = require("../controllers/pdfController");

const {
    convertOcrToWord,
} = require("../controllers/ocrController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.post("/compress", upload.single("file"), compressImage);
router.post("/resize", upload.single("file"), resizeImage);
router.post("/convert", upload.single("file"), convertImage);
router.post("/pdf/compress", upload.single("file"), compressPDF);
router.post(
    "/pdf/merge",
    upload.array("files", 20),
    mergePDFs
);

router.post(
    "/pdf/split",
    upload.single("file"),
    splitPDF
);

router.post(
    "/pdf/to-word",
    upload.single("file"),
    convertPdfToWord
);

router.post(
    "/pdf/to-excel",
    upload.single("file"),
    convertPdfToExcel
);
router.post(
    "/word/to-pdf",
    upload.single("file"),
    convertWordToPdf
);
router.post(
    "/word/to-excel",
    upload.single("file"),
    convertWordToExcel
);

router.post(
    "/excel/to-pdf",
    upload.single("file"),
    convertExcelToPdf
);
router.post(
    "/excel/to-word",
    upload.single("file"),
    convertExcelToWord
);

router.post("/ocr/to-word", upload.single("file"), convertOcrToWord);

router.post(
    "/convert/batch",
    upload.array("files", 20),
    batchConvertFiles
);

router.post(
    "/zip",
    upload.array("files", 20),
    zipFiles
);

router.get("/download/:filename", downloadFile);

router.get("/", getFiles);

module.exports = router;
