const crypto = require("crypto");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand,
    DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const config = require("../config/r2");
const fileLimits = require("../config/fileLimits");
const configuredRetention = Number(process.env.FILE_CLEANUP_TTL_MINUTES);
const retentionMs = Number.isFinite(configuredRetention) && configuredRetention > 0
    ? Math.max(1000, Math.floor(configuredRetention * 60 * 1000)) : 30 * 60 * 1000;

const mimeByExtension = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    avif: "image/avif", tiff: "image/tiff", zip: "application/zip",
};
const keyPattern = /^temp\/(input|output)\/[0-9a-f]{32}\.(pdf|docx|xlsx|jpg|jpeg|png|webp|avif|tiff|zip)$/;
const safeName = (name) => typeof name === "string" && name.length > 0 && name.length <= 255 &&
    name === path.basename(name) && !/[\\/\x00-\x1f]/.test(name);
const validKey = (key, kind) => typeof key === "string" && keyPattern.test(key) &&
    (!kind || key.startsWith(`temp/${kind}/`));
const invalidInput = (message, status = 400) => Object.assign(new Error(message), { status });

const createR2Service = ({ settings = config, client, sign = getSignedUrl,
    now = () => Date.now(), retentionMs: ttlMs = retentionMs } = {}) => {
    if (settings.enabled && !client) client = new S3Client({
        region: "auto",
        endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
        forcePathStyle: true,
    });
    const activeKeys = new Set();
    const requireEnabled = () => {
        if (!settings.enabled) throw new Error("R2 storage is not configured");
    };
    const tokenFor = (payload) => {
        const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const signature = crypto.createHmac("sha256", settings.signingSecret).update(data).digest("base64url");
        return `${data}.${signature}`;
    };
    const verifyReference = (reference, kind) => {
        requireEnabled();
        if (!reference || typeof reference.token !== "string") throw new Error("Invalid object reference");
        const parts = reference.token.split(".");
        if (parts.length !== 2 || !parts.every(Boolean)) throw new Error("Invalid object reference");
        const expected = crypto.createHmac("sha256", settings.signingSecret).update(parts[0]).digest();
        const actual = Buffer.from(parts[1], "base64url");
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error("Invalid object reference");
        let payload;
        try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString()); }
        catch { throw new Error("Invalid object reference"); }
        if (!validKey(payload.key, kind) || !safeName(payload.name) ||
            !Number.isSafeInteger(payload.size) || payload.size <= 0 ||
            mimeByExtension[path.extname(payload.name).slice(1).toLowerCase()] !== payload.type ||
            !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now()) {
            throw new Error("Invalid or expired object reference");
        }
        return payload;
    };
    const referenceFor = ({ key, name, size, type }) => {
        const payload = { key, name, size, type, expiresAt: now() + ttlMs };
        return { token: tokenFor(payload), key, name, size, type, expiresAt: payload.expiresAt };
    };

    const createUpload = async ({ name, size, type }) => {
        requireEnabled();
        if (!safeName(name)) throw new Error("Invalid filename");
        const extension = path.extname(name).slice(1).toLowerCase();
        if (!fileLimits.allAllowed.includes(extension) || type !== mimeByExtension[extension]) throw new Error("Unsupported file type or MIME type");
        const limit = fileLimits.imageExtensions.includes(extension) ? fileLimits.bytes.image :
            extension === "pdf" ? fileLimits.bytes.pdf : fileLimits.bytes.office;
        if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw new Error("File exceeds its size limit");
        const key = `temp/input/${crypto.randomBytes(16).toString("hex")}.${extension}`;
        const url = await sign(client, new PutObjectCommand({ Bucket: settings.bucket, Key: key, ContentType: type }),
            { expiresIn: settings.uploadUrlSeconds });
        return { url, method: "PUT", headers: { "Content-Type": type },
            object: referenceFor({ key, name, size, type }) };
    };

    const downloadUrl = async (reference) => {
        const payload = verifyReference(reference, "output");
        const url = await sign(client, new GetObjectCommand({ Bucket: settings.bucket, Key: payload.key,
            ResponseContentDisposition: `attachment; filename="${payload.name.replace(/["\\]/g, "_")}"` }),
        { expiresIn: settings.downloadUrlSeconds });
        return { url, expiresIn: settings.downloadUrlSeconds };
    };

    const downloadInput = async (reference, destination, maxBytes) => {
        const payload = verifyReference(reference, "input");
        let head;
        try { head = await client.send(new HeadObjectCommand({ Bucket: settings.bucket, Key: payload.key })); }
        catch (error) {
            if (["NoSuchKey", "NotFound"].includes(error.name) || error.message === "NoSuchKey")
                throw invalidInput("Uploaded object was not found");
            throw error;
        }
        if (head.ContentLength > maxBytes) throw invalidInput("Uploaded object exceeds its size limit", 413);
        if (head.ContentLength !== payload.size || head.ContentType !== payload.type)
            throw invalidInput("Uploaded object size or MIME type does not match its reference");
        const result = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: payload.key }));
        let received = 0;
        try {
            const limit = async function* (source) {
                for await (const chunk of source) {
                    received += chunk.length;
                    if (received > maxBytes) throw invalidInput("Uploaded object exceeds its size limit", 413);
                    if (received > payload.size) throw invalidInput("Uploaded object size changed during download");
                    yield chunk;
                }
            };
            await pipeline(result.Body, limit, fs.createWriteStream(destination, { flags: "wx" }));
            if (received !== payload.size) throw invalidInput("Uploaded object size changed during download");
        } catch (error) {
            await fsPromises.rm(destination, { force: true }).catch(() => {});
            throw error;
        }
        return payload;
    };

    const uploadOutput = async (localPath, name) => {
        requireEnabled();
        if (!safeName(name)) throw new Error("Invalid output filename");
        const extension = path.extname(name).slice(1).toLowerCase();
        const type = mimeByExtension[extension];
        if (!type) throw new Error("Unsupported output type");
        const size = (await fsPromises.stat(localPath)).size;
        const key = `temp/output/${crypto.randomBytes(16).toString("hex")}.${extension}`;
        await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key,
            Body: fs.createReadStream(localPath), ContentType: type, ContentLength: size }));
        const object = referenceFor({ key, name, size, type });
        try {
            return { object, downloadUrl: (await downloadUrl(object)).url };
        } catch (error) {
            await deleteObjects([key]).catch(() => {});
            throw error;
        }
    };

    const deleteObjects = async (keys) => {
        if (!settings.enabled) return;
        await Promise.all(keys.filter(key => validKey(key)).map(key =>
            client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }))));
    };

    const sweep = async () => {
        if (!settings.enabled) return 0;
        let deleted = 0;
        for (const prefix of ["temp/input/", "temp/output/"]) {
            let token;
            do {
                const page = await client.send(new ListObjectsV2Command({ Bucket: settings.bucket,
                    Prefix: prefix, ContinuationToken: token }));
                const stale = (page.Contents || []).filter(item => validKey(item.Key) && !activeKeys.has(item.Key) &&
                    item.LastModified && item.LastModified.getTime() < now() - ttlMs);
                await deleteObjects(stale.map(item => item.Key));
                deleted += stale.length;
                token = page.IsTruncated ? page.NextContinuationToken : undefined;
            } while (token);
        }
        return deleted;
    };

    const protect = (keys) => {
        keys.forEach(key => activeKeys.add(key));
        return () => keys.forEach(key => activeKeys.delete(key));
    };
    return { createUpload, downloadUrl, downloadInput, uploadOutput, deleteObjects,
        sweep, protect, verifyReference, validKey };
};

module.exports = { ...createR2Service(), createR2Service, validKey, mimeByExtension };
