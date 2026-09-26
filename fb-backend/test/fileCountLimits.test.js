process.env.FILE_STORAGE_MODE = "local";
process.env.RATE_LIMIT_LIGHT_MAX = "1000";
process.env.RATE_LIMIT_HEAVY_MAX = "1000";
process.env.RATE_LIMIT_VERY_HEAVY_MAX = "1000";
process.env.NODE_ENV = "production";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
process.chdir(path.resolve(__dirname, ".."));
const app = require("../src/app");
const { policies } = require("../src/middleware/validateUpload");
const { remotePreflight } = require("../src/middleware/r2Processing");

const uploadsDir = path.resolve("uploads");
const fixtures = path.resolve(__dirname, "../../test-files");
const waitForCleanup = async before => {
    for (let attempt = 0; attempt < 150; attempt++) {
        if ((await fs.readdir(uploadsDir)).every(name => before.has(name))) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    const remaining = (await fs.readdir(uploadsDir)).filter(name => !before.has(name));
    throw new Error(`Rejected upload left files: ${remaining.join(", ")}`);
};

(async () => {
    await fs.mkdir(uploadsDir, { recursive: true });
    const original = new Set(await fs.readdir(uploadsDir));
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const pdf = await fs.readFile(path.join(fixtures, "mixed-content.pdf"));
    const jpg = await fs.readFile(path.join(fixtures, "landscape.jpg"));
    const cases = [
        ["/files/convert/batch", 11, "landscape.jpg", "image/jpeg", jpg],
        ["/files/pdf/merge", 11, "mixed-content.pdf", "application/pdf", pdf],
        ["/files/zip", 51, "landscape.jpg", "image/jpeg", jpg],
    ];
    try {
        for (const [route, count, name, type, bytes] of cases) {
            const before = new Set(await fs.readdir(uploadsDir));
            const form = new FormData();
            for (let index = 0; index < count; index++) {
                form.append("files", new Blob([bytes], { type }), name);
            }
            if (route.includes("batch")) form.append("format", "webp");
            const response = await fetch(`${base}${route}`, { method: "POST", body: form,
                signal: AbortSignal.timeout(30000) });
            const body = await response.json();
            assert.equal(response.status, 400, `${route}: ${JSON.stringify(body)}`);
            assert.deepEqual(body, { error: "Too many uploaded files" });
            await waitForCleanup(before);
        }

        const before = new Set(await fs.readdir(uploadsDir));
        const tooLarge = new FormData();
        tooLarge.append("files", new Blob([Buffer.alloc(11 * 1024 * 1024)],
            { type: "image/jpeg" }), "large.jpg");
        tooLarge.append("format", "webp");
        const sizeResponse = await fetch(`${base}/files/convert/batch`, {
            method: "POST", body: tooLarge, signal: AbortSignal.timeout(30000),
        });
        assert.equal(sizeResponse.status, 413, "payload size limits remain 413");
        assert.ok((await sizeResponse.json()).error);
        await waitForCleanup(before);

        for (const [policy, count] of [[policies.batch, 11], [policies.merge, 11],
                                        [policies.zip, 51]]) {
            const response = {
                statusCode: 200,
                status(code) { this.statusCode = code; return this; },
                json(body) { this.body = body; return this; },
            };
            remotePreflight(policy)({ body: { files: Array(count).fill({}) } }, response,
                () => { throw new Error("Over-count R2 request passed preflight"); });
            assert.equal(response.statusCode, 400);
            assert.deepEqual(response.body, { error: "Too many uploaded files" });
        }
        console.log("Batch 11, merge 11, ZIP 51 counts return 400; size remains 413");
    } finally {
        await new Promise(resolve => server.close(resolve));
        for (const name of (await fs.readdir(uploadsDir)).filter(name => !original.has(name))) {
            const target = path.resolve(uploadsDir, name);
            if (path.dirname(target) === uploadsDir) await fs.rm(target, { force: true });
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
