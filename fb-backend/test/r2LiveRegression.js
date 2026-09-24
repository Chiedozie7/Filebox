// Explicit opt-in live check; never run in CI and never print credentials or URLs.
if (process.env.RUN_LIVE_R2 !== "1") throw new Error("Set RUN_LIVE_R2=1 for the live test");
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const JSZip = require("jszip");
const config = require("../src/config/r2");
assert.equal(config.enabled, true);
const logger = require("../src/services/logger");
const logs = [];
Object.assign(logger, logger.createLogger({ environment: "production", write: line => logs.push(line) }));
const app = require("../src/app");
const queue = require("../src/middleware/jobQueue");
const r2 = require("../src/services/r2Service");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
const client = new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, forcePathStyle: true });
const keys = [];
const root = path.resolve(__dirname, "../..");
const out = path.join(root, "test-output/regression-20260924");
const waitFor = async fn => {
    for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
    throw new Error("Timed out waiting for live cleanup");
};
(async () => {
    const before = new Set(await fs.readdir("uploads"));
    const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body) => fetch(`${base}/files${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const stage = async (name, bytes, type) => {
        const response = await post("/r2/upload-url", { name, size: bytes.length, type });
        assert.equal(response.status, 200);
        const upload = await response.json(); keys.push(upload.object.key);
        assert.ok((await fetch(upload.url, { method: "PUT", headers: upload.headers, body: bytes })).ok);
        return upload.object;
    };
    const gone = async key => {
        try { await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key })); return false; }
        catch (error) { if (error.$metadata?.httpStatusCode === 404) return true; throw error; }
    };
    try {
        const png = await fs.readFile(path.join(root, "test-files/transparent.png"));
        const jpg = await fs.readFile(path.join(root, "test-files/landscape.jpg"));
        const input = await stage("transparent.png", png, "image/png");
        const response = await post("/compress", { file: input }); assert.equal(response.status, 200);
        const body = await response.json(); keys.push(body.output.key);
        const downloaded = await fetch(body.downloadUrl); assert.equal(downloaded.status, 200);
        assert.equal(downloaded.headers.get("content-disposition"), `attachment; filename="${body.output.name}"`);
        assert.equal(downloaded.headers.get("content-type"), "image/png");
        const image = Buffer.from(await downloaded.arrayBuffer());
        await sharp(image).raw().toBuffer(); assert.ok(image.length <= png.length);
        await fs.writeFile(path.join(out, "live-r2.png"), image);
        const refresh = await post("/r2/download-url", { object: body.output }); assert.equal(refresh.status, 200);
        const refreshed = await refresh.json();
        assert.equal(new URL(refreshed.url).searchParams.get("response-content-disposition"), `attachment; filename="${body.output.name}"`);
        await waitFor(() => gone(input.key));
        const inputs = [await stage("landscape.jpg", jpg, "image/jpeg"), await stage("transparent.png", png, "image/png")];
        const originalDownload = r2.downloadInput;
        let observedSlots = false;
        r2.downloadInput = async (...args) => {
            assert.equal(queue.stats().heavy.active, 1); assert.equal(queue.stats().veryHeavy.active, 0);
            observedSlots = true; return originalDownload(...args);
        };
        const batch = await post("/convert/batch", { files: inputs, format: "webp" });
        r2.downloadInput = originalDownload;
        assert.equal(batch.status, 200); assert.ok(observedSlots);
        const batchBody = await batch.json(); keys.push(batchBody.output.key);
        const zipResponse = await fetch(batchBody.downloadUrl); assert.equal(zipResponse.status, 200);
        const zipBytes = Buffer.from(await zipResponse.arrayBuffer());
        const archive = await JSZip.loadAsync(zipBytes, { checkCRC32: true });
        const members = Object.values(archive.files).filter(f => !f.dir); assert.equal(members.length, 2);
        for (const member of members) await sharp(await member.async("nodebuffer")).raw().toBuffer();
        await fs.writeFile(path.join(out, "live-r2-batch.zip"), zipBytes);
        for (const item of inputs) await waitFor(() => gone(item.key));
        const bad = await stage("invalid.png", Buffer.from("not an image"), "image/png");
        assert.equal((await post("/compress", { file: bad })).status, 400);
        await waitFor(() => gone(bad.key));
        await waitFor(() => queue.stats().heavy.active === 0);
        assert.deepEqual(new Set(await fs.readdir("uploads")), before);
        const serialized = logs.join("\n");
        for (const secret of [config.secretAccessKey, config.accessKeyId, config.signingSecret]) assert.ok(!serialized.includes(secret));
        assert.ok(!/X-Amz-|https?:\/\//i.test(serialized));
        const report = { passed: true, single: 200, batch: 200, invalid: 400, batchMembers: 2,
            batchQueueSlots: 1, attachment: true, refresh: true, inputsDeleted: true, stagingClean: true, logsRedacted: true };
        await fs.writeFile(path.join(out, "live-r2-results.json"), JSON.stringify(report, null, 2));
        await fs.writeFile(path.join(out, "live-r2-logs.jsonl"), serialized);
        console.log(JSON.stringify(report));
    } finally {
        // Only objects created by this run; prior user-requested download outputs are untouched.
        await r2.deleteObjects(keys);
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        client.destroy();
    }
})().catch(error => { console.error("Live R2 regression failed:", error.name); process.exitCode = 1; });
