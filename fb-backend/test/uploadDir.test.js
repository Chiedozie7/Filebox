const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const staging = fsSync.mkdtempSync(path.join(os.tmpdir(), "fileforge-upload-dir-"));
process.env.UPLOAD_DIR = staging;
process.env.FILE_STORAGE_MODE = "local";
process.env.NODE_ENV = "production";
process.env.RATE_LIMIT_HEAVY_MAX = "100";
process.env.RATE_LIMIT_LIGHT_MAX = "100";
const app = require("../src/app");
const { uploadDir } = require("../src/config/uploadDir");
const { createCleanupService } = require("../src/services/temporaryFileCleanup");

const waitFor = async (condition) => {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await condition()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Timed out waiting for input cleanup");
};

(async () => {
    assert.equal(uploadDir, staging);
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const png = await fs.readFile(path.resolve(__dirname, "../../test-files/transparent.png"));
    const post = async (route, fields = {}) => {
        const form = new FormData();
        form.append("file", new Blob([png], { type: "image/png" }), "transparent.png");
        for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
        return fetch(`${base}/files${route}`, { method: "POST", body: form });
    };
    try {
        const success = await post("/compress");
        assert.equal(success.status, 200);
        const result = await success.json();
        await waitFor(async () => (await fs.readdir(uploadDir)).length === 1);
        assert.deepEqual(await fs.readdir(uploadDir), [result.compressed]);
        assert.ok((await fs.stat(path.join(uploadDir, result.compressed))).size > 0);
        assert.equal((await fetch(`${base}/files/download/${result.compressed}`)).status, 200);

        const failed = await post("/resize", { width: 0 });
        assert.equal(failed.status, 400);
        await waitFor(async () => (await fs.readdir(uploadDir)).length === 1);

        const permanent = await post("/upload");
        assert.equal(permanent.status, 503);
        assert.match((await permanent.json()).error, /durable local storage/);
        assert.deepEqual(await fs.readdir(uploadDir), [result.compressed]);

        const stale = path.join(uploadDir, "stale.pdf");
        await fs.writeFile(stale, "%PDF-1.4");
        const old = new Date(Date.now() - 31 * 60 * 1000);
        await fs.utimes(stale, old, old);
        const cleanup = createCleanupService({ sweepR2: async () => 0 });
        await cleanup.sweep();
        assert.equal(fsSync.existsSync(stale), false);
        assert.equal(fsSync.existsSync(path.join(uploadDir, result.compressed)), true);
        console.log("Configured local upload directory, cleanup, and permanent-upload guard passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (path.dirname(staging) === os.tmpdir()) await fs.rm(staging, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
