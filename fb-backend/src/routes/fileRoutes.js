const express = require("express");
const upload = require("../middleware/upload");
const { policyUpload, policies } = require("../middleware/validateUpload");
const { light, heavy, veryHeavy, mergeLimiter } = require("../middleware/rateLimits");
const jobQueue = require("../middleware/jobQueue");
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
router.post("/compress", heavy, policyUpload(policies.images), jobQueue.heavy, jobQueue.run(trackProcessing(compressImage)));
router.post("/resize", heavy, policyUpload(policies.images), jobQueue.heavy, jobQueue.run(trackProcessing(resizeImage)));
router.post("/convert", heavy, policyUpload(policies.images), jobQueue.heavy, jobQueue.run(trackProcessing(convertImage)));
router.post("/pdf/compress", heavy, policyUpload(policies.pdf), jobQueue.heavy, jobQueue.run(trackProcessing(compressPDF)));
router.post("/pdf/unlock", heavy, policyUpload(policies.pdf), jobQueue.heavy, jobQueue.run(trackProcessing(unlockPDF)));
router.post("/pdf/merge", policyUpload(policies.merge), mergeLimiter, jobQueue.merge, jobQueue.run(trackProcessing(mergePDFs)));
router.post("/pdf/split", heavy, policyUpload(policies.pdf), jobQueue.heavy, jobQueue.run(trackProcessing(splitPDF)));
router.post("/pdf/to-word", veryHeavy, policyUpload(policies.pdf), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertPdfToWord)));
router.post("/pdf/to-excel", veryHeavy, policyUpload(policies.pdf), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertPdfToExcel)));
router.post("/word/to-pdf", veryHeavy, policyUpload(policies.docx), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertWordToPdf)));
router.post("/word/to-excel", veryHeavy, policyUpload(policies.docx), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertWordToExcel)));
router.post("/excel/to-pdf", veryHeavy, policyUpload(policies.xlsx), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertExcelToPdf)));
router.post("/excel/to-word", veryHeavy, policyUpload(policies.xlsx), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertExcelToWord)));
router.post("/ocr/to-word", veryHeavy, policyUpload(policies.ocr), jobQueue.veryHeavy, jobQueue.run(trackProcessing(convertOcrToWord)));
router.post("/convert/batch", heavy, policyUpload(policies.batch), jobQueue.heavy, jobQueue.run(trackProcessing(batchConvertFiles)));
router.post("/zip", light, policyUpload(policies.zip), trackProcessing(zipFiles));
router.get("/download/:filename", light, trackProcessing(downloadFile));
router.get("/", light, trackProcessing(getFiles));
module.exports = router;
