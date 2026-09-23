const mb = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value * 1024 * 1024) : fallback * 1024 * 1024;
};
const count = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
};

const imageExtensions = ["jpg", "jpeg", "png", "webp", "avif", "tiff"];
const officeExtensions = ["docx", "xlsx"];
const allAllowed = ["pdf", ...officeExtensions, ...imageExtensions];

module.exports = {
    imageExtensions,
    allAllowed,
    bytes: {
        image: mb("FILE_LIMIT_IMAGE_MB", 10),
        pdf: mb("FILE_LIMIT_PDF_MB", 50),
        office: mb("FILE_LIMIT_OFFICE_MB", 30),
        ocrPdf: mb("FILE_LIMIT_OCR_PDF_MB", 40),
        mergeTotal: mb("FILE_LIMIT_MERGE_TOTAL_MB", 100),
        batchTotal: mb("FILE_LIMIT_BATCH_TOTAL_MB", 100),
        zipTotal: mb("FILE_LIMIT_ZIP_TOTAL_MB", 200),
    },
    counts: {
        merge: count("FILE_LIMIT_MERGE_COUNT", 10),
        batch: count("FILE_LIMIT_BATCH_COUNT", 10),
        zip: count("FILE_LIMIT_ZIP_COUNT", 50),
        ocrPages: count("FILE_LIMIT_OCR_PAGES", 100),
    },
};
