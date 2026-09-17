const express = require("express");
const upload = require("../middleware/upload");
const {
    uploadFile,
    getFiles,
    compressImage,
    resizeImage,
    convertImage,
    mergePDFs,
    splitPDF,
} = require("../controllers/fileController");

const {
    convertPdfToWord,
    convertPdfToExcel,
} = require("../controllers/pdfController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.post("/compress", upload.single("file"), compressImage);
router.post("/resize", upload.single("file"), resizeImage);
router.post("/convert", upload.single("file"), convertImage);
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
router.get("/", getFiles);

module.exports = router;