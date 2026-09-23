const multer = require("multer");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { Transform, pipeline } = require("stream");
const { PDFDocument } = require("pdf-lib");
const imageService = require("../services/imageService");
const limits = require("../config/fileLimits");

const mimeByExt = {
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"],
    webp: ["image/webp"], avif: ["image/avif", "image/heif"],
    tiff: ["image/tiff"],
};
const displayMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
const policyStorage = (policy) => ({
    _handleFile(req, file, cb) {
        const extension = path.extname(file.originalname).toLowerCase().slice(1);
        const perFileLimit = typeof policy.maxFor === "function" ? policy.maxFor(extension) : policy.maxPerFile;
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        const destination = "uploads/";
        const filePath = path.join(destination, filename);
        let size = 0;
        const limiter = new Transform({
            transform(chunk, encoding, done) {
                size += chunk.length;
                const requestSize = (req._fileForgeBytes || 0) + chunk.length;
                if (perFileLimit && size > perFileLimit) {
                    const error = new Error("Per-file upload limit exceeded");
                    error.code = "LIMIT_FILE_SIZE";
                    return done(error);
                }
                if (policy.maxTotal && requestSize > policy.maxTotal) {
                    const error = new Error("Total file upload limit exceeded");
                    error.code = "LIMIT_TOTAL_SIZE";
                    return done(error);
                }
                req._fileForgeBytes = requestSize;
                done(null, chunk);
            },
        });
        pipeline(file.stream, limiter, fsSync.createWriteStream(filePath), async error => {
            if (error) {
                await fs.rm(filePath, { force: true }).catch(() => {});
                return cb(error);
            }
            cb(null, { destination, filename, path: filePath, size });
        });
    },
    _removeFile(req, file, cb) {
        fs.rm(file.path, { force: true }).then(() => cb(null), cb);
    },
});

const oneFile = (policy, field, maxFiles, maxIndividual) => multer({
    storage: policyStorage(policy),
    limits: { files: maxFiles, fileSize: maxIndividual },
}).array(field, maxFiles);

const reject = async (req, res, status, error) => {
    const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
    await Promise.all(files.map(file => fs.rm(file.path, { force: true }).catch(() => {})));
    res.status(status).json({ error });
};

const zipEntries = (buffer) => {
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error("Invalid ZIP archive");
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);
    const names = new Set();
    for (let i = 0; i < count; i++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP directory");
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        names.add(buffer.subarray(offset + 46, offset + 46 + nameLength).toString());
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return names;
};

const policyUpload = (policy) => (req, res, next) => {
    req._fileForgeBytes = 0;
    oneFile(policy, policy.field || "file", policy.maxCount || 1, policy.uploadMax || limits.bytes.pdf)(req, res, async (error) => {
        if (error) {
            const unexpectedField = error.code === "LIMIT_UNEXPECTED_FILE" && error.field !== (policy.field || "file");
            const status = unexpectedField ? 400 : ["LIMIT_FILE_SIZE", "LIMIT_TOTAL_SIZE", "LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE"].includes(error.code) ? 413 : 400;
            const message = unexpectedField ? `Files must use the multipart field "${policy.field || "file"}"` : error.code === "LIMIT_TOTAL_SIZE" ? `Total uploaded file size exceeds ${displayMb(policy.maxTotal)} MB` : error.code === "LIMIT_FILE_SIZE" ? "Uploaded file exceeds the configured size limit" : "Too many uploaded files";
            return reject(req, res, status, message);
        }
        const files = req.files || [];
        if ((policy.maxCount || 1) === 1 && files.length) req.file = files[0];
        if (policy.minCount && files.length < policy.minCount) return reject(req, res, 400, `At least ${policy.minCount} file(s) are required`);
        if (!files.length) return reject(req, res, 400, "No files uploaded");

        let total = 0;
        for (const file of files) {
            total += file.size;
            const ext = path.extname(file.originalname).toLowerCase().slice(1);
            const allowed = policy.allowed || policy.extensions;
            if (!allowed.includes(ext)) return reject(req, res, 400, `Unsupported file type: ${ext || "unknown"}`);
            const perFile = typeof policy.maxFor === "function" ? policy.maxFor(ext) : policy.maxPerFile;
            if (perFile && file.size > perFile) return reject(req, res, 413, `${ext.toUpperCase()} files must not exceed ${displayMb(perFile)} MB`);
            const acceptedMime = mimeByExt[ext] || [];
            if (file.mimetype !== "application/octet-stream" && !acceptedMime.includes(file.mimetype)) return reject(req, res, 400, `MIME type does not match .${ext} file extension`);
            try {
                const fd = await fs.open(file.path, "r");
                const head = Buffer.alloc(Math.min(file.size, 16));
                await fd.read(head, 0, head.length, 0);
                await fd.close();
                if (ext === "pdf" && !head.subarray(0, Math.min(head.length, 8)).includes(Buffer.from("%PDF-"))) return reject(req, res, 400, "File signature does not match PDF");
                if (limits.imageExtensions.includes(ext)) {
                    const valid = await imageService.isSupportedStaticImage(file.path, ext === "jpg" ? "jpeg" : ext);
                    if (!valid) return reject(req, res, 400, "Image signature or format is invalid; only supported static images are allowed");
                }
                if (officeExtensions.includes(ext)) {
                    if (head.subarray(0, 2).toString() !== "PK") return reject(req, res, 400, `File signature does not match ${ext.toUpperCase()}`);
                    const entries = ext === "docx" ? ["[Content_Types].xml", "word/document.xml"] : ["[Content_Types].xml", "xl/workbook.xml"];
                    const names = zipEntries(await fs.readFile(file.path));
                    if (!entries.every(entry => names.has(entry))) return reject(req, res, 400, `File is not a valid ${ext.toUpperCase()} package`);
                }
            } catch {
                return reject(req, res, 400, "Uploaded file is invalid or cannot be read");
            }
        }
        if (policy.maxTotal && total > policy.maxTotal) return reject(req, res, 413, `Total uploaded file size exceeds ${displayMb(policy.maxTotal)} MB`);
        if (policy.ocrPages && path.extname(files[0].originalname).toLowerCase() === ".pdf") {
            try {
                const document = await PDFDocument.load(await fs.readFile(files[0].path));
                if (document.getPageCount() > policy.ocrPages) return reject(req, res, 413, `OCR PDF exceeds the ${policy.ocrPages}-page limit`);
            } catch {
                return reject(req, res, 400, "PDF is invalid, unreadable, or password-protected");
            }
        }
        next();
    });
};

const images = { field:"file", extensions:limits.imageExtensions, maxPerFile:limits.bytes.image, uploadMax:limits.bytes.image };
const pdf = { field:"file", extensions:["pdf"], maxPerFile:limits.bytes.pdf, uploadMax:limits.bytes.pdf };
const office = (ext) => ({ field:"file", extensions:[ext], maxPerFile:limits.bytes.office, uploadMax:limits.bytes.office });
const ocr = { field:"file", extensions:[...limits.imageExtensions,"pdf"], maxFor:ext=>ext==="pdf"?limits.bytes.ocrPdf:limits.bytes.image, uploadMax:Math.max(limits.bytes.ocrPdf,limits.bytes.image), ocrPages:limits.counts.ocrPages };
const multiple = (kind) => ({
    field:"files", allowed: kind === "zip" ? limits.allAllowed : limits.allAllowed,
    maxCount:limits.counts[kind], minCount:kind==="merge"?2:1,
    maxTotal:limits.bytes[`${kind}Total`], uploadMax:Math.max(limits.bytes.pdf,limits.bytes.office,limits.bytes.image),
    maxFor:ext=>ext==="pdf"?limits.bytes.pdf:officeExtensions.includes(ext)?limits.bytes.office:limits.bytes.image,
});
const officeExtensions = limits.allAllowed.filter(ext=>["docx","xlsx"].includes(ext));
module.exports = { policyUpload, policies:{ images, pdf, docx:office("docx"), xlsx:office("xlsx"), ocr, merge:multiple("merge"), batch:multiple("batch"), zip:multiple("zip") } };
