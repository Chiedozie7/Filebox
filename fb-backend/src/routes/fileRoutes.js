const express = require("express");
const upload = require("../middleware/upload");
const { policyUpload, policies } = require("../middleware/validateUpload");
const { light, heavy, veryHeavy, mergeLimiter } = require("../middleware/rateLimits");
const {
    uploadFile, getFiles, compressImage, resizeImage, convertImage, compressPDF,
    unlockPDF, mergePDFs, splitPDF, convertWordToPdf, convertWordToExcel,
    convertExcelToPdf, convertExcelToWord, downloadFile, batchConvertFiles, zipFiles,
} = require("../controllers/fileController");
const { convertPdfToWord, convertPdfToExcel } = require("../controllers/pdfController");
const { convertOcrToWord } = require("../controllers/ocrController");

const router = express.Router();
router.post("/upload", light, upload.single("file"), uploadFile);
router.post("/compress", heavy, policyUpload(policies.images), compressImage);
router.post("/resize", heavy, policyUpload(policies.images), resizeImage);
router.post("/convert", heavy, policyUpload(policies.images), convertImage);
router.post("/pdf/compress", heavy, policyUpload(policies.pdf), compressPDF);
router.post("/pdf/unlock", heavy, policyUpload(policies.pdf), unlockPDF);
router.post("/pdf/merge", policyUpload(policies.merge), mergeLimiter, mergePDFs);
router.post("/pdf/split", heavy, policyUpload(policies.pdf), splitPDF);
router.post("/pdf/to-word", veryHeavy, policyUpload(policies.pdf), convertPdfToWord);
router.post("/pdf/to-excel", veryHeavy, policyUpload(policies.pdf), convertPdfToExcel);
router.post("/word/to-pdf", veryHeavy, policyUpload(policies.docx), convertWordToPdf);
router.post("/word/to-excel", veryHeavy, policyUpload(policies.docx), convertWordToExcel);
router.post("/excel/to-pdf", veryHeavy, policyUpload(policies.xlsx), convertExcelToPdf);
router.post("/excel/to-word", veryHeavy, policyUpload(policies.xlsx), convertExcelToWord);
router.post("/ocr/to-word", veryHeavy, policyUpload(policies.ocr), convertOcrToWord);
router.post("/convert/batch", heavy, policyUpload(policies.batch), batchConvertFiles);
router.post("/zip", light, policyUpload(policies.zip), zipFiles);
router.get("/download/:filename", light, downloadFile);
router.get("/", light, getFiles);
module.exports = router;
