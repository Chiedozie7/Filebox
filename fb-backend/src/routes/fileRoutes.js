const express = require("express");
const upload = require("../middleware/upload");
const {
    uploadFile,
    getFiles,
    compressImage,
    resizeImage,
    convertImage,
} = require("../controllers/fileController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.post("/compress", upload.single("file"), compressImage);
router.post("/resize", upload.single("file"), resizeImage);
router.post("/convert", upload.single("file"), convertImage);
router.get("/", getFiles);

module.exports = router;