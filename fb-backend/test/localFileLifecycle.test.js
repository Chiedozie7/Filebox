process.env.FILE_STORAGE_MODE = "local";
process.env.RATE_LIMIT_LIGHT_MAX = "1000";
process.env.RATE_LIMIT_HEAVY_MAX = "1000";
process.env.RATE_LIMIT_VERY_HEAVY_MAX = "1000";
process.env.NODE_ENV = "production";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
process.chdir(path.resolve(__dirname, ".."));
const app = require("../src/app");

const uploadsDir = path.resolve("uploads");
const fixtures = path.resolve(__dirname, "../../test-files");
const mime = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const names = async () => new Set(await fs.readdir(uploadsDir));
const added = async (before) => [...await names()].filter(name => !before.has(name));
const waitFor = async (check, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${label}`);
};

(async () => {
    await fs.mkdir(uploadsDir, { recursive: true });
    const originalNames = await names();
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (route, files, fields = {}) => {
        const before = await names();
        const form = new FormData();
        const multiple = ["/pdf/merge", "/convert/batch", "/zip"].includes(route);
        for (const item of files) {
            const filePath = path.join(fixtures, item);
            const filename = path.basename(filePath);
            const extension = path.extname(filename).slice(1);
            form.append(multiple ? "files" : "file",
                new Blob([await fs.readFile(filePath)], { type: mime[extension] || "application/octet-stream" }), filename);
        }
        for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
        const response = await fetch(`${base}/files${route}`, { method: "POST", body: form,
            signal: AbortSignal.timeout(180000) });
        const type = response.headers.get("content-type") || "";
        const body = type.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer());
        return { before, status: response.status, body };
    };
    const expectFiles = async (result, expected) => {
        await waitFor(async () => {
            const current = await added(result.before);
            return current.length === expected.length && expected.every(name => current.includes(name));
        }, `only ${expected.join(", ") || "no temporary files"} to remain`);
    };
    const success = async (route, files, fields, outputField) => {
        const result = await post(route, files, fields);
        assert.equal(result.status, 200, `${route}: ${JSON.stringify(result.body)}`);
        if (outputField) {
            const outputName = result.body[outputField];
            assert.ok(outputName, `${route} should return ${outputField}`);
            await expectFiles(result, [outputName]);
            assert.ok((await fs.stat(path.join(uploadsDir, outputName))).size > 0);
            const download = await fetch(`${base}/files/download/${encodeURIComponent(outputName)}`);
            assert.equal(download.status, 200, `${route} output remains downloadable`);
            assert.ok((await download.arrayBuffer()).byteLength > 0);
        } else {
            assert.ok(Buffer.isBuffer(result.body) && result.body.length > 0);
            await expectFiles(result, []);
        }
    };
    const failure = async (route, files, fields, status) => {
        const result = await post(route, files, fields);
        assert.equal(result.status, status, `${route}: ${JSON.stringify(result.body)}`);
        await expectFiles(result, []);
    };

    try {
        await success("/compress", ["landscape.jpg"], {}, "compressed");
        await failure("/resize", ["landscape.jpg"], { width: 0 }, 400);
        await success("/pdf/compress", ["mixed-content.pdf"], {}, "compressed");
        await failure("/pdf/split", ["mixed-content.pdf"], { startPage: 5, endPage: 6 }, 400);
        await success("/word/to-excel", ["operations-report.docx"], {}, "converted");
        await success("/pdf/to-excel", ["table-ledger.pdf"], {}, "converted");
        await success("/pdf/merge", ["mixed-content.pdf", "landscape.jpg"], {}, "merged");
        await success("/convert/batch", ["landscape.jpg", "transparent.png"], { format: "webp" }, "zip");
        await failure("/convert/batch", ["landscape.jpg", "mixed-content.pdf"], { format: "webp" }, 400);
        await success("/zip", ["manual-QA/duplicate-names/a/same-name.jpg",
            "manual-QA/duplicate-names/b/same-name.jpg"], {}, "zip");
        await failure("/zip", ["animated.gif"], {}, 400);
        await success("/ocr/to-word", ["delivery-note.png"], {}, null);

        const beforeAbort = await names();
        const request = http.request(`${base}/files/compress`, {
            method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=fixture-boundary" },
        });
        request.on("error", () => {});
        request.write("--fixture-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"aborted.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n");
        request.write((await fs.readFile(path.join(fixtures, "landscape.jpg"))).subarray(0, 32768));
        await waitFor(async () => (await added(beforeAbort)).length > 0, "partial upload to begin");
        request.destroy();
        await waitFor(async () => (await added(beforeAbort)).length === 0, "aborted upload cleanup");
        console.log("Local processing lifecycle checks passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
        for (const name of await added(originalNames)) {
            const filePath = path.resolve(uploadsDir, name);
            if (path.dirname(filePath) === uploadsDir) await fs.rm(filePath, { force: true });
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
