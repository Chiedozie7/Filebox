const express = require("express");
const { policies, policyUpload } = require("../middleware/validateUpload");
const { light, heavy, veryHeavy, mergeLimiter } = require("../middleware/rateLimits");
const jobQueue = require("../middleware/jobQueue");
const r2Processing = require("../middleware/r2Processing");
const { trackProcessing, retryBusyInputs } = require("../services/temporaryFileCleanup");
const {
    uploadFile, getFiles, compressImage, resizeImage, convertImage, compressPDF,
    unlockPDF, mergePDFs, splitPDF, convertWordToPdf, convertWordToExcel,
    convertExcelToPdf, convertExcelToWord, downloadFile, batchConvertFiles, zipFiles,
} = require("../controllers/fileController");
const { convertPdfToWord, convertPdfToExcel } = require("../controllers/pdfController");
const { convertOcrToWord } = require("../controllers/ocrController");
const { createUploadUrl, createDownloadUrl } = require("../controllers/r2Controller");

const router = express.Router();
router.use(r2Processing.cleanupRejected);
const queued = (policy, queue, controller) => [r2Processing.input(policy), queue,
    jobQueue.run(trackProcessing(r2Processing.process(policy, controller)))];
router.post("/r2/upload-url", light, createUploadUrl);
router.post("/r2/download-url", light, createDownloadUrl);
router.post("/upload", light, policyUpload({ ...policies.zip, field: "file", maxCount: 1 }), trackProcessing(uploadFile));
router.post("/compress", heavy, ...queued(policies.images, jobQueue.heavy, compressImage));
router.post("/resize", heavy, ...queued(policies.images, jobQueue.heavy, resizeImage));
router.post("/convert", heavy, ...queued(policies.images, jobQueue.heavy, convertImage));
router.post("/pdf/compress", heavy, ...queued(policies.pdf, jobQueue.heavy, compressPDF));
router.post("/pdf/unlock", heavy, ...queued(policies.pdf, jobQueue.heavy, unlockPDF));
router.post("/pdf/merge", r2Processing.input(policies.merge), mergeLimiter, jobQueue.merge,
    jobQueue.run(trackProcessing(r2Processing.process(policies.merge, mergePDFs))));
router.post("/pdf/split", heavy, ...queued(policies.pdf, jobQueue.heavy, splitPDF));
router.post("/pdf/to-word", veryHeavy, ...queued(policies.pdf, jobQueue.veryHeavy, convertPdfToWord));
router.post("/pdf/to-excel", veryHeavy, ...queued(policies.pdf, jobQueue.veryHeavy, convertPdfToExcel));
router.post("/word/to-pdf", veryHeavy, ...queued(policies.docx, jobQueue.veryHeavy, convertWordToPdf));
router.post("/word/to-excel", veryHeavy, ...queued(policies.docx, jobQueue.veryHeavy, convertWordToExcel));
router.post("/excel/to-pdf", veryHeavy, ...queued(policies.xlsx, jobQueue.veryHeavy, convertExcelToPdf));
router.post("/excel/to-word", veryHeavy, ...queued(policies.xlsx, jobQueue.veryHeavy, convertExcelToWord));
router.post("/ocr/to-word", veryHeavy, ...queued(policies.ocr, jobQueue.veryHeavy, convertOcrToWord));
router.post("/convert/batch", heavy, ...queued(policies.batch, jobQueue.heavy, batchConvertFiles));
router.post("/zip", light, retryBusyInputs, r2Processing.input(policies.zip), trackProcessing(r2Processing.process(policies.zip, zipFiles)));
router.get("/download/:filename", light, trackProcessing(downloadFile));
router.get("/", light, trackProcessing(getFiles));
module.exports = router;
