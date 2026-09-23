const express = require("express");
const upload = require("../middleware/upload");
const { policyUpload, policies } = require("../middleware/validateUpload");
const { light, heavy, veryHeavy, mergeLimiter } = require("../middleware/rateLimits");
const { trackProcessing } = require("../services/temporaryFileCleanup");
const {
    uploadFile, getFiles, compressImage, resizeImage, convertImage, compressPDF,
    unlockPDF, mergePDFs, splitPDF, convertWordToPdf, convertWordToExcel,
    convertExcelToPdf, convertExcelToWord, downloadFile, batchConvertFiles, zipFiles,
} = require("../controllers/fileController");
const { convertPdfToWord, convertPdfToExcel } = require("../controllers/pdfController");
const { convertOcrToWord } = require("../controllers/ocrController");

const router = express.Router();
router.post("/upload", light, upload.single("file"), trackProcessing(uploadFile));
router.post("/compress", heavy, policyUpload(policies.images), trackProcessing(compressImage));
router.post("/resize", heavy, policyUpload(policies.images), trackProcessing(resizeImage));
router.post("/convert", heavy, policyUpload(policies.images), trackProcessing(convertImage));
router.post("/pdf/compress", heavy, policyUpload(policies.pdf), trackProcessing(compressPDF));
router.post("/pdf/unlock", heavy, policyUpload(policies.pdf), trackProcessing(unlockPDF));
router.post("/pdf/merge", policyUpload(policies.merge), mergeLimiter, trackProcessing(mergePDFs));
router.post("/pdf/split", heavy, policyUpload(policies.pdf), trackProcessing(splitPDF));
router.post("/pdf/to-word", veryHeavy, policyUpload(policies.pdf), trackProcessing(convertPdfToWord));
router.post("/pdf/to-excel", veryHeavy, policyUpload(policies.pdf), trackProcessing(convertPdfToExcel));
router.post("/word/to-pdf", veryHeavy, policyUpload(policies.docx), trackProcessing(convertWordToPdf));
router.post("/word/to-excel", veryHeavy, policyUpload(policies.docx), trackProcessing(convertWordToExcel));
router.post("/excel/to-pdf", veryHeavy, policyUpload(policies.xlsx), trackProcessing(convertExcelToPdf));
router.post("/excel/to-word", veryHeavy, policyUpload(policies.xlsx), trackProcessing(convertExcelToWord));
router.post("/ocr/to-word", veryHeavy, policyUpload(policies.ocr), trackProcessing(convertOcrToWord));
router.post("/convert/batch", heavy, policyUpload(policies.batch), trackProcessing(batchConvertFiles));
router.post("/zip", light, policyUpload(policies.zip), trackProcessing(zipFiles));
router.get("/download/:filename", light, trackProcessing(downloadFile));
router.get("/", light, trackProcessing(getFiles));
module.exports = router;
