const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { uploadDir } = require("../config/uploadDir");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdir(uploadDir, { recursive: true }, error => cb(error, uploadDir));
    },

    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;

        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
});

module.exports = upload;
