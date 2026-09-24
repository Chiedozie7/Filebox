const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const config = require("../config/r2");
const r2 = require("../services/r2Service");
const { policyUpload, validateStoredFiles } = require("./validateUpload");

const outputFields = ["compressed", "resized", "converted", "unlocked", "merged", "split", "zip"];
const statusFor = (message) => /size limit|exceeds|too many/i.test(message) ? 413 : 400;

const remotePreflight = (policy) => (req, res, next) => {
    try {
        const references = policy.field === "files" ? req.body?.files : [req.body?.file];
        if (!Array.isArray(references) || references.some(reference => !reference)) throw new Error("Object references are required");
        if (references.length < (policy.minCount || 1)) throw new Error(`At least ${policy.minCount || 1} file(s) are required`);
        if (references.length > (policy.maxCount || 1)) throw new Error("Too many uploaded files");
        const payloads = references.map(reference => r2.verifyReference(reference, "input"));
        let total = 0;
        for (const payload of payloads) {
            const extension = path.extname(payload.name).slice(1).toLowerCase();
            if (!(policy.allowed || policy.extensions).includes(extension)) throw new Error(`Unsupported file type: ${extension}`);
            const maximum = typeof policy.maxFor === "function" ? policy.maxFor(extension) : policy.maxPerFile;
            if (maximum && payload.size > maximum) throw new Error(`${extension.toUpperCase()} file exceeds its size limit`);
            total += payload.size;
        }
        if (policy.maxTotal && total > policy.maxTotal) throw new Error("Total uploaded file size exceeds its limit");
        req.remoteReferences = references;
        req.remotePayloads = payloads;
        // The merge limiter and queue classify from original filenames, before downloading.
        req.files = payloads.map(payload => ({ originalname: payload.name, size: payload.size, mimetype: payload.type }));
        if (policy.field !== "files") req.file = req.files[0];
        res.once("close", () => {
            if (!res.writableFinished && !req.jobQueueLease) {
                void r2.deleteObjects(payloads.map(payload => payload.key)).catch(error =>
                    console.error("Abandoned R2 input cleanup failed:", error));
            }
        });
        next();
    } catch (error) {
        res.status(statusFor(error.message)).json({ error: error.message });
    }
};

const input = (policy) => config.enabled ? remotePreflight(policy) : policyUpload(policy);

const process = (policy, controller) => async (req, res, next) => {
    if (!config.enabled) return controller(req, res, next);

    const localPaths = [];
    const inputKeys = req.remotePayloads.map(payload => payload.key);
    const releaseProtection = r2.protect(inputKeys);
    const originalJson = res.json.bind(res);
    const originalDownload = res.download.bind(res);
    let responsePromise;
    let publishedKey;
    let delivered = false;

    const publish = async (filePath, name, body) => {
        const result = await r2.uploadOutput(filePath, name);
        publishedKey = result.object.key;
        if (res.destroyed) return;
        delivered = true;
        originalJson({ ...body, output: result.object, downloadUrl: result.downloadUrl });
    };

    try {
        await fs.mkdir("uploads", { recursive: true });
        const staged = [];
        for (const [index, payload] of req.remotePayloads.entries()) {
            const filename = `${crypto.randomBytes(16).toString("hex")}${path.extname(payload.name).toLowerCase()}`;
            const filePath = path.join("uploads", filename);
            localPaths.push(filePath);
            const maximum = typeof policy.maxFor === "function" ? policy.maxFor(path.extname(payload.name).slice(1).toLowerCase()) : policy.maxPerFile;
            await r2.downloadInput(req.remoteReferences[index], filePath, maximum);
            staged.push({ originalname: payload.name, filename, path: filePath,
                size: payload.size, mimetype: payload.type });
        }
        req.files = staged;
        if (policy.field !== "files") req.file = staged[0];
        await new Promise((resolve, reject) => {
            const done = () => { res.off("finish", done); resolve(); };
            res.once("finish", done);
            Promise.resolve(validateStoredFiles(policy, req, res, done)).catch(reject);
        });
        if (res.headersSent || res.destroyed) return;

        res.json = (body) => {
            if (res.statusCode >= 400) {
                responsePromise = Promise.resolve(originalJson(body));
                return res;
            }
            const field = outputFields.find(name => typeof body?.[name] === "string");
            if (!field) {
                responsePromise = Promise.resolve(originalJson(body));
                return res;
            }
            const name = path.basename(body[field]);
            responsePromise = publish(path.join("uploads", name), name, body);
            return res;
        };
        res.download = (filePath, name) => {
            responsePromise = publish(filePath, name, { message: "OCR conversion completed" });
            return res;
        };
        await controller(req, res, next);
        if (responsePromise) await responsePromise;
    } catch (error) {
        if (!error.status) console.error("R2 processing failed:", error);
        if (!res.headersSent && !res.destroyed) {
            res.status(error.status || 500);
            originalJson({ error: error.status ? error.message : "Failed to process R2 file" });
        }
    } finally {
        res.json = originalJson;
        res.download = originalDownload;
        const outputs = [...(req.cleanupJob?.outputs || [])];
        await Promise.all([...localPaths, ...outputs].map(file => fs.rm(file, { force: true }).catch(() => {})));
        try { await r2.deleteObjects(inputKeys); }
        catch (error) { console.error("R2 input cleanup failed:", error); }
        if (publishedKey && !delivered) {
            try { await r2.deleteObjects([publishedKey]); }
            catch (error) { console.error("R2 output cleanup failed:", error); }
        }
        releaseProtection();
    }
};

module.exports = { input, process, remotePreflight };
