const express = require("express");
const upload = require("../middleware/upload");
const {
    uploadFile,
    getFiles,
    compressImage,
    resizeImage
} = require("../controllers/fileController");

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.post("/compress", upload.single("file"), compressImage);
router.post("/resize", upload.single("file"), resizeImage);
router.get("/", getFiles);

module.exports = router;