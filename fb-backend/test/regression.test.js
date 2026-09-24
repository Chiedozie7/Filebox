// Real local HTTP regression run. Outputs are retained outside the cleanup roots.
process.env.FILE_STORAGE_MODE = "local";
process.env.RATE_LIMIT_LIGHT_MAX = "1000";
process.env.RATE_LIMIT_HEAVY_MAX = "1000";
process.env.RATE_LIMIT_VERY_HEAVY_MAX = "1000";
process.env.NODE_ENV = "production";
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const JSZip = require("jszip");
const { PDFDocument } = require("pdf-lib");
const ExcelJS = require("exceljs");
const app = require("../src/app");
const queue = require("../src/middleware/jobQueue");
const root = path.resolve(__dirname, "../..");
const out = path.join(root, "test-output/regression-20260924");
const fixture = name => path.join(root, "test-files", name);
const mime = require("../src/services/r2Service").mimeByExtension;
const results = [];
let base;
async function check(name, fn) {
    if (process.env.REGRESSION_ONLY && !new RegExp(process.env.REGRESSION_ONLY).test(name)) return;
    const started = Date.now();
    try { const detail = await fn(); results.push({ name, pass: true, detail, milliseconds: Date.now() - started }); }
    catch (error) { results.push({ name, pass: false, error: error.message, milliseconds: Date.now() - started }); }
    await fs.writeFile(path.join(out, process.env.REGRESSION_ONLY ? "targeted-results.json" : "results.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ check: name, pass: results.at(-1).pass, error: results.at(-1).error }));
}
async function post(route, names, fields = {}, status = 200, label) {
    const before = new Set(await fs.readdir("uploads"));
    const multiple = ["/pdf/merge", "/convert/batch", "/zip"].includes(route);
    const form = new FormData();
    for (const item of names) {
        const spec = typeof item === "string" ? { file: fixture(item) } : item;
        const name = spec.name || path.basename(spec.file);
        const bytes = spec.bytes || await fs.readFile(spec.file);
        form.append(multiple ? "files" : "file", new Blob([bytes], { type: spec.type || mime[path.extname(name).slice(1)] || "application/octet-stream" }), name);
    }
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    const response = await fetch(`${base}/files${route}`, { method: "POST", body: form, signal: AbortSignal.timeout(240000) });
    const contentType = response.headers.get("content-type") || "";
    let body, bytes;
    if (contentType.includes("json")) body = await response.json();
    else bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, status, `${route}: ${JSON.stringify(body)}`);
    if (status >= 400) {
        for (let i = 0; i < 100; i++) {
            if ((await fs.readdir("uploads")).every(name => before.has(name))) break;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.deepEqual(new Set(await fs.readdir("uploads")), before, "failed request left local files");
        assert.equal(queue.stats().heavy.active + queue.stats().veryHeavy.active, 0, "failed request retained queue slot");
        return { status, body };
    }
    const field = ["compressed", "converted", "resized", "merged", "split", "unlocked", "zip"].find(key => body?.[key]);
    if (field) {
        const download = await fetch(`${base}/files/download/${body[field]}`);
        assert.equal(download.status, 200);
        bytes = Buffer.from(await download.arrayBuffer());
    }
    if (bytes) {
        assert.ok(bytes.length);
        const ext = field ? path.extname(body[field]) : ".docx";
        const filename = path.join(out, (label || route.replaceAll("/", "-")) + ext);
        await fs.writeFile(filename, bytes);
        if (ext === ".pdf") assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
        else if ([".docx", ".xlsx", ".zip"].includes(ext)) {
            const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
            assert.ok(Object.keys(zip.files).length > 0);
        } else await sharp(bytes).raw().toBuffer();
        return { status, body, output: filename, bytes: bytes.length };
    }
    return { status, body };
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    try {
        await check("health and root", async () => {
            for (const route of ["/health", "/"]) assert.equal((await fetch(base + route)).status, 200);
        });
        for (const name of ["landscape.jpg", "transparent.png", "portrait.webp", "square.avif", "wide.tiff"]) {
            await check(`compress ${name}`, async () => {
                const r = await post("/compress", [name], {}, 200, `compress-${name}`);
                assert.ok(r.bytes <= (await fs.stat(fixture(name))).size);
                if (name === "transparent.png") {
                    assert.equal(r.body.usedOriginal, true);
                    assert.deepEqual(await fs.readFile(r.output), await fs.readFile(fixture(name)));
                }
                return r;
            });
            await check(`resize ${name}`, async () => {
                const r = await post("/resize", [name], { width: 300 }, 200, `resize-${name}`);
                assert.equal((await sharp(r.output).metadata()).width, 300); return r;
            });
        }
        for (const format of ["jpg", "png", "webp", "avif", "tiff"])
            await check(`convert to ${format}`, () => post("/convert", ["transparent.png"], { format }, 200, `convert-${format}`));
        await check("PDF merge", async () => {
            const r = await post("/pdf/merge", ["mixed-content.pdf", "supplier-appendix.pdf"], {}, 200, "pdf-merge");
            const counts = await Promise.all(["mixed-content.pdf", "supplier-appendix.pdf"].map(async n => (await PDFDocument.load(await fs.readFile(fixture(n)))).getPageCount()));
            assert.equal((await PDFDocument.load(await fs.readFile(r.output))).getPageCount(), counts[0] + counts[1]); return r;
        });
        await check("PDF split", async () => {
            const r = await post("/pdf/split", ["mixed-content.pdf"], { startPage: 1, endPage: 2 }, 200, "pdf-split");
            assert.equal((await PDFDocument.load(await fs.readFile(r.output))).getPageCount(), 2); return r;
        });
        await check("PDF compress", async () => {
            const r = await post("/pdf/compress", ["mixed-content.pdf"], {}, 200, "pdf-compress");
            assert.ok(r.bytes <= (await fs.stat(fixture("mixed-content.pdf"))).size); return r;
        });
        const protectedFile = path.join(root, "test-output/pdf-unlock/protected-mixed-content.pdf");
        await check("PDF unlock correct", () => post("/pdf/unlock", [{ file: protectedFile }], { password: "FileForge-test-2026" }, 200, "pdf-unlock"));
        await check("PDF unlock wrong", () => post("/pdf/unlock", [{ file: protectedFile }], { password: "wrong" }, 401));
        await check("PDF unlock already open", () => post("/pdf/unlock", ["mixed-content.pdf"], {}, 200, "pdf-already-open"));
        for (const [route, name] of [["/pdf/to-word", "mixed-content.pdf"], ["/pdf/to-excel", "mixed-content.pdf"], ["/word/to-pdf", "operations-report.docx"], ["/word/to-excel", "operations-report.docx"], ["/excel/to-pdf", "operations-workbook.xlsx"], ["/excel/to-word", "operations-workbook.xlsx"]])
            await check(route, () => post(route, [name], {}, 200, route.slice(1).replaceAll("/", "-")));
        await check("mixed merge ordered", () => post("/pdf/merge", ["operations-report.docx", "landscape.jpg", "mixed-content.pdf", "operations-workbook.xlsx"], {}, 200, "mixed-merge"));
        await check("parallel Office batch and direct conversion", async () => {
            const both = await Promise.allSettled([
                post("/convert/batch", ["operations-report.docx", "operations-workbook.xlsx"], { format: "pdf" }, 200, "parallel-batch"),
                post("/word/to-pdf", ["operations-report.docx"], {}, 200, "parallel-word")
            ]);
            for (const result of both) assert.equal(result.status, "fulfilled", result.reason?.message);
        });
        for (const name of ["delivery-note.png", "mixed-content.pdf"])
            await check(`OCR ${name}`, () => post("/ocr/to-word", [name], {}, 200, `ocr-${name}`));
        for (const [format, names] of [["webp", ["landscape.jpg", "transparent.png"]], ["pdf", ["operations-report.docx", "operations-workbook.xlsx"]], ["docx", ["mixed-content.pdf", "operations-workbook.xlsx"]], ["xlsx", ["mixed-content.pdf", "operations-report.docx"]]])
            await check(`batch ${format}`, async () => {
                const r = await post("/convert/batch", names, { format }, 200, `batch-${format}`);
                const zip = await JSZip.loadAsync(await fs.readFile(r.output), { checkCRC32: true });
                const entries = Object.values(zip.files).filter(f => !f.dir);
                assert.equal(entries.length, names.length);
                for (const e of entries) {
                    const bytes = await e.async("nodebuffer");
                    if (format === "pdf") await PDFDocument.load(bytes);
                    else if (format === "webp") await sharp(bytes).raw().toBuffer();
                    else await JSZip.loadAsync(bytes, { checkCRC32: true });
                }
                return r;
            });
        await check("ZIP duplicate filenames", async () => {
            const r = await post("/zip", ["mixed-content.pdf", "operations-report.docx", "operations-workbook.xlsx", "landscape.jpg", "landscape.jpg", { file: fixture("landscape.jpg"), name: "landscape (2).jpg" }], {}, 200, "zip-duplicates");
            const zip = await JSZip.loadAsync(await fs.readFile(r.output), { checkCRC32: true });
            assert.equal(Object.values(zip.files).filter(f => !f.dir).length, 6);
            for (const name of r.body.files) assert.ok((await zip.file(name).async("nodebuffer")).length);
            return r;
        });
        const failures = [
            ["GIF compress", "/compress", ["palette.gif"], {}, 400],
            ["GIF resize", "/resize", ["animated.gif"], { width: 20 }, 400],
            ["GIF output", "/convert", ["landscape.jpg"], { format: "gif" }, 400],
            ["GIF OCR", "/ocr/to-word", ["palette.gif"], {}, 400],
            ["unsupported mixed merge", "/pdf/merge", ["mixed-content.pdf", "animated.gif"], {}, 400],
            ["unsupported mixed batch", "/convert/batch", ["landscape.jpg", "mixed-content.pdf"], { format: "webp" }, 400],
            ["unsupported ZIP", "/zip", ["mixed-content.pdf", "palette.gif"], {}, 400],
            ["merge count", "/pdf/merge", Array(11).fill("mixed-content.pdf"), {}, 413],
            ["batch count", "/convert/batch", Array(11).fill("landscape.jpg"), { format: "webp" }, 413],
            ["ZIP count", "/zip", Array(51).fill("landscape.jpg"), {}, 413],
            ["MIME mismatch", "/compress", [{ file: fixture("transparent.png"), type: "application/pdf" }], {}, 400],
            ["signature mismatch", "/compress", [{ name: "fake.png", bytes: Buffer.from("not an image") }], {}, 400],
            ["DOCX wrong type", "/word/to-excel", ["operations-workbook.xlsx"], {}, 400],
            ["XLSX wrong type", "/excel/to-word", ["operations-report.docx"], {}, 400],
            ["PDF wrong type", "/pdf/compress", ["operations-report.docx"], {}, 400],
            ["negative resize", "/resize", ["landscape.jpg"], { width: -1 }, 400],
            ["fractional PDF split", "/pdf/split", ["mixed-content.pdf"], { startPage: 1.5, endPage: 2 }, 400],
            ["out-of-range PDF split", "/pdf/split", ["mixed-content.pdf"], { startPage: 1, endPage: 999 }, 400],
        ];
        for (const [name, route, names, fields, status] of failures) await check(name, () => post(route, names, fields, status));
        for (const [name, route, mb] of [["oversize.png", "/compress", 11], ["oversize.pdf", "/pdf/compress", 51], ["oversize.docx", "/word/to-excel", 31], ["oversize.pdf", "/ocr/to-word", 41]])
            await check(`size ${route}`, () => post(route, [{ name, bytes: Buffer.alloc(mb * 1024 * 1024) }], {}, 413));
        const many = await PDFDocument.create(); for (let i = 0; i < 101; i++) many.addPage();
        await check("OCR empty PDF", () => post("/ocr/to-word", [{ name: "many.pdf", bytes: Buffer.alloc(0) }], {}, 400));
        await check("OCR 101-page rejection", async () => post("/ocr/to-word", [{ name: "many.pdf", bytes: Buffer.from(await many.save()) }], {}, 413));
        await check("missing download", async () => assert.equal((await fetch(`${base}/files/download/nonexistent.png`)).status, 404));
        await check("legacy file listing", async () => { const r = await fetch(`${base}/files/`, { signal: AbortSignal.timeout(10000) }); assert.equal(r.status, 200); assert.ok(Array.isArray(await r.json())); });
        for (const [name, expected] of [["transparent.png", 201], ["palette.gif", 400]]) {
            await check(`legacy upload ${name}`, async () => {
                const form = new FormData();
                form.append("file", new Blob([await fs.readFile(fixture(name))], { type: name.endsWith("gif") ? "image/gif" : "image/png" }), name);
                const res = await fetch(`${base}/files/upload`, { method: "POST", body: form });
                const row = await res.json();
                if (res.status === 201) {
                    await require("../src/config/db").query("DELETE FROM files WHERE id = $1 AND stored_name = $2", [row.id, row.stored_name]);
                    await fs.rm(path.join("uploads", path.basename(row.stored_name)), { force: true });
                }
                assert.equal(res.status, expected);
            });
        }
        await check("legacy upload size limit", () => post("/upload", [{ name: "oversize.png", bytes: Buffer.alloc(11 * 1024 * 1024) }], {}, 413));
        await check("legacy upload signature", () => post("/upload", [{ name: "fake.png", bytes: Buffer.from("not an image") }], {}, 400));
        if (process.env.REGRESSION_AGGREGATE) {
            for (const route of ["/zip", "/pdf/merge", "/convert/batch"])
                await check(`aggregate ${route}`, () => post(route, ["landscape.jpg", "transparent.png"], { format: "webp" }, 413));
        }
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await require("../src/config/db").end();
    }
    console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).map(r => r.name) }));
    process.exitCode = results.some(r => !r.pass) ? 1 : 0;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
