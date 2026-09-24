const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");

process.chdir(path.resolve(__dirname, ".."));
process.env.FILE_STORAGE_MODE = "r2";
process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ACCESS_KEY_ID = "test-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret";
process.env.R2_REF_SIGNING_SECRET = "test-reference-signing-secret";
process.env.JOB_QUEUE_HEAVY_CONCURRENCY = "1";
process.env.RATE_LIMIT_HEAVY_MAX = "20";
process.env.RATE_LIMIT_VERY_HEAVY_MAX = "20";

const { createR2Service, validKey } = require("../src/services/r2Service");
const r2Module = require("../src/services/r2Service");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

const objects = new Map();
const commands = [];
let failOutputUpload = false;
const client = {
    async send(command) {
        const kind = command.constructor.name;
        const input = command.input;
        commands.push({ kind, input });
        if (kind === "PutObjectCommand") {
            if (failOutputUpload && input.Key.startsWith("temp/output/")) throw new Error("Simulated R2 output failure");
            const chunks = [];
            for await (const chunk of input.Body) chunks.push(chunk);
            objects.set(input.Key, { bytes: Buffer.concat(chunks), type: input.ContentType, modified: new Date() });
            return {};
        }
        if (kind === "HeadObjectCommand") {
            const item = objects.get(input.Key);
            if (!item) throw new Error("NoSuchKey");
            return { ContentLength: item.bytes.length, ContentType: item.type };
        }
        if (kind === "GetObjectCommand") {
            const item = objects.get(input.Key);
            if (!item) throw new Error("NoSuchKey");
            return { Body: Readable.from([item.bytes]) };
        }
        if (kind === "DeleteObjectCommand") { objects.delete(input.Key); return {}; }
        if (kind === "ListObjectsV2Command") {
            return { Contents: [...objects.entries()].filter(([key]) => key.startsWith(input.Prefix))
                .map(([Key, item]) => ({ Key, LastModified: item.modified })) };
        }
        throw new Error(`Unexpected command: ${kind}`);
    },
};
const sign = async (unusedClient, command, options) =>
    `https://r2.example/${command.constructor.name}/${command.input.Key}?expires=${options.expiresIn}`;
const settings = {
    enabled: true, bucket: "test-bucket", signingSecret: process.env.R2_REF_SIGNING_SECRET,
    uploadUrlSeconds: 300, downloadUrlSeconds: 300,
};
const r2 = createR2Service({ settings, client, sign });
Object.assign(r2Module, r2);
const app = require("../src/app");
const jobQueue = require("../src/middleware/jobQueue");
const fixtureDir = path.resolve(__dirname, "../../test-files");

const waitFor = async (condition) => {
    const deadline = Date.now() + 5000;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for queue state");
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};
const post = (base, route, body) => fetch(`${base}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const stage = async (base, name, type, bytes) => {
    const response = await post(base, "/files/r2/upload-url", { name, type, size: bytes.length });
    assert.equal(response.status, 200);
    const upload = await response.json();
    assert.match(upload.url, /PutObjectCommand/);
    assert.equal(upload.headers["Content-Type"], type);
    objects.set(upload.object.key, { bytes, type, modified: new Date() });
    return upload.object;
};

(async () => {
    assert.equal(validKey("temp/input/" + "a".repeat(32) + ".pdf", "input"), true);
    for (const key of ["../../secret", "temp/input/../secret.pdf", "temp/output/" + "a".repeat(32) + ".exe"])
        assert.equal(validKey(key), false, `invalid key rejected: ${key}`);

    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const png = await fs.readFile(path.join(fixtureDir, "transparent.png"));
        const input = await stage(base, "transparent.png", "image/png", png);
        assert.match(input.key, /^temp\/input\/[0-9a-f]{32}\.png$/);
        const forged = { ...input, token: input.token.slice(0, -1) + "x" };
        const invalid = await post(base, "/files/compress", { file: forged });
        assert.equal(invalid.status, 400);
        const before = new Set(await fs.readdir("uploads"));
        const processed = await post(base, "/files/compress", { file: input });
        assert.equal(processed.status, 200);
        const body = await processed.json();
        assert.match(body.downloadUrl, /GetObjectCommand/);
        assert.equal(validKey(body.output.key, "output"), true);
        assert.equal(await sharp(objects.get(body.output.key).bytes).metadata().then(value => value.format), "png");
        await waitFor(() => !objects.has(input.key) && jobQueue.stats().heavy.active === 0);
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "local staging and output removed");

        const refreshed = await post(base, "/files/r2/download-url", { object: body.output });
        assert.equal(refreshed.status, 200);
        assert.match((await refreshed.json()).url, /GetObjectCommand/);
        assert.ok(commands.some(item => item.kind === "HeadObjectCommand" && item.input.Key === input.key));
        assert.ok(commands.some(item => item.kind === "PutObjectCommand" && item.input.Key === body.output.key));

        const bad = await stage(base, "broken.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("not a DOCX"));
        const failed = await post(base, "/files/word/to-pdf", { file: bad });
        assert.equal(failed.status, 400, "signature validation remains in force");
        await waitFor(() => !objects.has(bad.key));
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "failed staging removed");

        const jpeg = await fs.readFile(path.join(fixtureDir, "landscape.jpg"));
        const batchInputA = await stage(base, "landscape.jpg", "image/jpeg", jpeg);
        const batchInputB = await stage(base, "transparent.png", "image/png", png);
        const batchInputC = await stage(base, "landscape.jpg", "image/jpeg", jpeg);
        const originalDownload = r2Module.downloadInput;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let first = true;
        r2Module.downloadInput = async (...args) => {
            if (first) { first = false; await gate; }
            return originalDownload(...args);
        };
        const batchOne = post(base, "/files/convert/batch", { files: [batchInputA, batchInputB], format: "webp" });
        await waitFor(() => jobQueue.stats().heavy.active === 1);
        const batchTwo = post(base, "/files/convert/batch", { files: [batchInputC], format: "webp" });
        await waitFor(() => jobQueue.stats().heavy.waiting === 1);
        assert.equal(jobQueue.stats().heavy.active, 1, "a two-file batch occupies one queue slot");
        release();
        const batchResponseOne = await batchOne;
        const batchResponseTwo = await batchTwo;
        r2Module.downloadInput = originalDownload;
        assert.equal(batchResponseOne.status, 200);
        assert.equal(batchResponseTwo.status, 200);
        const batchBody = await batchResponseOne.json();
        assert.equal(batchBody.filesConverted, 2);
        assert.equal(objects.get(batchBody.output.key).bytes.subarray(0, 2).toString(), "PK");
        await waitFor(() => jobQueue.stats().heavy.active === 0);
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "batch staging and intermediates removed");

        const sourcePdf = await fs.readFile(path.join(fixtureDir, "mixed-content.pdf"));
        const mergePdf = await stage(base, "mixed-content.pdf", "application/pdf", sourcePdf);
        const mergeImage = await stage(base, "landscape.jpg", "image/jpeg", jpeg);
        const mixedResponse = await post(base, "/files/pdf/merge", { files: [mergePdf, mergeImage] });
        assert.equal(mixedResponse.status, 200);
        const mixedBody = await mixedResponse.json();
        const mergedPdf = await PDFDocument.load(objects.get(mixedBody.output.key).bytes);
        const originalPdf = await PDFDocument.load(sourcePdf);
        assert.equal(mergedPdf.getPageCount(), originalPdf.getPageCount() + 1);
        assert.deepEqual(mergedPdf.getPage(0).getSize(), originalPdf.getPage(0).getSize(), "PDF pages remain first");
        await waitFor(() => !objects.has(mergePdf.key) && !objects.has(mergeImage.key));
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "mixed merge local files removed");

        const staleKey = `temp/input/${"b".repeat(32)}.pdf`;
        objects.set(staleKey, { bytes: Buffer.from("%PDF"), type: "application/pdf",
            modified: new Date(Date.now() - 31 * 60 * 1000) });
        assert.equal(await r2.sweep(), 1);
        assert.equal(objects.has(staleKey), false, "expired object deleted");
        assert.equal(objects.has(body.output.key), true, "recent output preserved");

        const mismatched = await stage(base, "transparent.png", "image/png", png);
        objects.set(mismatched.key, { bytes: png.subarray(0, png.length - 1), type: "image/png", modified: new Date() });
        const mismatchResponse = await post(base, "/files/compress", { file: mismatched });
        assert.equal(mismatchResponse.status, 400);
        await waitFor(() => !objects.has(mismatched.key) && jobQueue.stats().heavy.active === 0);
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "failed R2 download leaves no staging file");

        const outputFailureInput = await stage(base, "transparent.png", "image/png", png);
        failOutputUpload = true;
        const outputFailure = await post(base, "/files/compress", { file: outputFailureInput });
        failOutputUpload = false;
        assert.equal(outputFailure.status, 500);
        await waitFor(() => !objects.has(outputFailureInput.key) && jobQueue.stats().heavy.active === 0);
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "failed output upload removes local files");
        console.log("R2 signing, key, processing, cleanup, batch queue, and expiry checks passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
