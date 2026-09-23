const express = require("express");
const upload = require("../middleware/upload");
const { policyUpload, policies } = require("../middleware/validateUpload");
const {
    uploadFile, getFiles, compressImage, resizeImage, convertImage, compressPDF,
    unlockPDF, mergePDFs, splitPDF, convertWordToPdf, convertWordToExcel,
    convertExcelToPdf, convertExcelToWord, downloadFile, batchConvertFiles, zipFiles,
} = require("../controllers/fileController");
const { convertPdfToWord, convertPdfToExcel } = require("../controllers/pdfController");
const { convertOcrToWord } = require("../controllers/ocrController");

const router = express.Router();
router.post("/upload", upload.single("file"), uploadFile);
router.post("/compress", policyUpload(policies.images), compressImage);
router.post("/resize", policyUpload(policies.images), resizeImage);
router.post("/convert", policyUpload(policies.images), convertImage);
router.post("/pdf/compress", policyUpload(policies.pdf), compressPDF);
router.post("/pdf/unlock", policyUpload(policies.pdf), unlockPDF);
router.post("/pdf/merge", policyUpload(policies.merge), mergePDFs);
router.post("/pdf/split", policyUpload(policies.pdf), splitPDF);
router.post("/pdf/to-word", policyUpload(policies.pdf), convertPdfToWord);
router.post("/pdf/to-excel", policyUpload(policies.pdf), convertPdfToExcel);
router.post("/word/to-pdf", policyUpload(policies.docx), convertWordToPdf);
router.post("/word/to-excel", policyUpload(policies.docx), convertWordToExcel);
router.post("/excel/to-pdf", policyUpload(policies.xlsx), convertExcelToPdf);
router.post("/excel/to-word", policyUpload(policies.xlsx), convertExcelToWord);
router.post("/ocr/to-word", policyUpload(policies.ocr), convertOcrToWord);
router.post("/convert/batch", policyUpload(policies.batch), batchConvertFiles);
router.post("/zip", policyUpload(policies.zip), zipFiles);
router.get("/download/:filename", downloadFile);
router.get("/", getFiles);
module.exports = router;
