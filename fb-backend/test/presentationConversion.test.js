const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const JSZip = require("jszip");
const exec = promisify(execFile);
process.chdir(path.resolve(__dirname, ".."));
const remote = process.argv.includes("--r2");
Object.assign(process.env, { FILE_STORAGE_MODE: remote ? "r2" : "local", NODE_ENV: "production",
    RATE_LIMIT_LIGHT_MAX: "100", RATE_LIMIT_HEAVY_MAX: "100", RATE_LIMIT_VERY_HEAVY_MAX: "100",
    R2_ACCOUNT_ID: "mock", R2_BUCKET: "mock", R2_ACCESS_KEY_ID: "mock",
    R2_SECRET_ACCESS_KEY: "mock", R2_REF_SIGNING_SECRET: "presentation-test-only" });
const objects = new Map();
const r2 = require("../src/services/r2Service");
if (remote) Object.assign(r2, r2.createR2Service({
    settings: { enabled: true, bucket: "mock", signingSecret: "presentation-test-only",
        uploadUrlSeconds: 60, downloadUrlSeconds: 60 },
    client: { async send({ input, constructor }) {
        if (constructor.name === "PutObjectCommand") {
            const chunks = [];
            for await (const chunk of input.Body) chunks.push(chunk);
            objects.set(input.Key, { bytes: Buffer.concat(chunks), type: input.ContentType });
        } else if (constructor.name === "GetObjectCommand") {
            return { Body: Readable.from([objects.get(input.Key).bytes]) };
        } else if (constructor.name === "HeadObjectCommand") {
            const value = objects.get(input.Key);
            return { ContentLength: value.bytes.length, ContentType: value.type };
        } else if (constructor.name === "DeleteObjectCommand") objects.delete(input.Key);
        else throw new Error(`Unexpected mock command ${constructor.name}`);
        return {};
    } },
    sign: async (client, command) => `https://r2.invalid/${command.input.Key}?${new URLSearchParams({
        disposition: command.input.ResponseContentDisposition || "", type: command.input.ResponseContentType || "" })}`,
}));
const queue = require("../src/middleware/jobQueue");
const presentation = require("../src/services/presentationService");
let failNext = false;
let calls = 0;
for (const method of ["convertPptxToPdf", "convertPdfToPptx"]) {
    const original = presentation[method];
    presentation[method] = async (...args) => {
        calls++;
        assert.equal(queue.stats().veryHeavy.active, 1);
        assert.equal(queue.stats().heavy.active, 0);
        if (failNext) {
            failNext = false;
            await fs.writeFile(args[1], "partial output");
            throw new Error("Simulated presentation conversion failure");
        }
        return original(...args);
    };
}
const app = require("../src/app");
const fixtures = path.resolve("../test-files");
const types = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
const names = async () => (await fs.readdir("uploads")).sort();
const wait = async check => {
    for (let i = 0; i < 300; i++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Presentation cleanup/queue did not settle");
};

(async () => {
    await fs.mkdir("uploads", { recursive: true });
    const originalNames = await names();
    const folder = await fs.mkdtemp(path.resolve("test/.presentation-"));
    let server;
    try {
        await exec("python", ["test/presentationArtifacts.py", "create", folder], { timeout: 30000 });
        server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
        const base = `http://127.0.0.1:${server.address().port}`;
        const json = (url, body) => fetch(base + url, { method: "POST",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const request = async (route, files, fields = {}, expected = 200) => {
            const before = await names();
            const refs = [];
            const form = new FormData();
            for (const item of files) {
                const name = item.name || path.basename(item.path);
                const bytes = item.bytes || await fs.readFile(item.path);
                const type = item.type || types[path.extname(name).slice(1)] || "application/octet-stream";
                if (remote) {
                    const upload = await json("/files/r2/upload-url", { name, size: bytes.length, type });
                    assert.equal(upload.status, 200);
                    const data = await upload.json();
                    objects.set(data.object.key, { bytes, type });
                    refs.push(data.object);
                } else form.append(route.includes("batch") ? "files" : "file", new Blob([bytes], { type }), name);
            }
            for (const [key, value] of Object.entries(fields)) form.append(key, value);
            const response = remote ? await json(route, { ...fields,
                ...(route.includes("batch") ? { files: refs } : { file: refs[0] }) }) :
                await fetch(base + route, { method: "POST", body: form, signal: AbortSignal.timeout(180000) });
            const body = await response.json();
            assert.equal(response.status, expected, JSON.stringify(body));
            if (expected === 200) assert.match(response.headers.get("ratelimit-policy"), /veryHeavy/);
            const outputName = body.converted || body.zip;
            const expectedNames = remote || expected !== 200 ? before : [...before, outputName].sort();
            await wait(async () => JSON.stringify(await names()) === JSON.stringify(expectedNames) && queue.stats().veryHeavy.active === 0);
            if (remote) await wait(() => refs.every(ref => !objects.has(ref.key)));
            if (expected !== 200) return body;
            let bytes;
            if (remote) {
                assert.ok(body.downloadUrl && r2.validKey(body.output.key, "output"));
                assert.equal(body.output.type, body.zip ? "application/zip" : types[path.extname(outputName).slice(1)]);
                assert.match(new URL(body.downloadUrl).searchParams.get("disposition"), /attachment/);
                bytes = objects.get(body.output.key).bytes;
                const refreshed = await json("/files/r2/download-url", { object: body.output });
                assert.equal(refreshed.status, 200);
            } else {
                const download = await fetch(`${base}/files/download/${outputName}`);
                assert.equal(download.status, 200);
                bytes = Buffer.from(await download.arrayBuffer());
                await fs.rm(path.join("uploads", outputName));
            }
            return { bytes, body };
        };
        const deck = path.join(folder, "targeted.pptx");
        const office = await request("/files/pptx/to-pdf", [{ path: deck }]);
        await fs.writeFile(path.join(folder, "office.pdf"), office.bytes);
        for (const name of ["mixed-content", "table-ledger", "geometry", "scanned"]) {
            const input = path.join(["geometry", "scanned"].includes(name) ? folder : fixtures, `${name}.pdf`);
            const result = await request("/files/pdf/to-pptx", [{ path: input }]);
            await fs.writeFile(path.join(folder, `${name}.pptx`), result.bytes);
        }
        const beforeBatch = calls;
        const batch = await request("/files/convert/batch", [{ path: path.join(fixtures, "mixed-content.pdf") },
            { path: path.join(fixtures, "table-ledger.pdf") }], { format: "pptx" });
        const archive = await JSZip.loadAsync(batch.bytes);
        const entries = Object.values(archive.files).filter(file => !file.dir);
        assert.equal(entries.length, 2);
        for (const entry of entries) {
            const packageZip = await JSZip.loadAsync(await entry.async("nodebuffer"));
            assert.ok(packageZip.file("ppt/presentation.xml"));
        }
        assert.equal(calls - beforeBatch, 2, "two conversions share one request queue slot");
        const pdfBatch = await request("/files/convert/batch", [{ path: deck },
            { path: path.join(fixtures, "operations-report.docx") }], { format: "pdf" });
        const pdfArchive = await JSZip.loadAsync(pdfBatch.bytes);
        assert.equal(Object.values(pdfArchive.files).filter(file => !file.dir).length, 2);
        const beforeUnsupported = calls;
        await request("/files/convert/batch", [{ path: deck }, { path: path.join(fixtures, "mixed-content.pdf") }], { format: "pptx" }, 400);
        assert.equal(calls, beforeUnsupported, "unsupported mixed batch rejected before processing");
        await request("/files/pptx/to-pdf", [{ name: "bad.pptx", bytes: Buffer.from("not a package") }], {}, 400);
        if (!remote) {
            await request("/files/pptx/to-pdf", [{ path: deck, name: "legacy.ppt" }], {}, 400);
            await request("/files/pptx/to-pdf", [{ path: deck, type: "application/pdf" }], {}, 400);
            await request("/files/pptx/to-pdf", [{ path: path.join(fixtures, "operations-report.docx"), name: "renamed.pptx" }], {}, 400);
        } else {
            assert.equal((await json("/files/r2/upload-url", { name: "legacy.ppt", size: 100, type: "application/vnd.ms-powerpoint" })).status, 400);
            assert.equal((await json("/files/r2/upload-url", { name: "large.pptx", size: 31 * 1024 * 1024, type: types.pptx })).status, 400);
        }
        failNext = true;
        await request("/files/pdf/to-pptx", [{ path: path.join(fixtures, "mixed-content.pdf") }], {}, 500);
        const verified = await exec("python", ["test/presentationArtifacts.py", "verify", folder], { timeout: 30000 });
        console.log(verified.stdout.trim());
        // Export one reconstruction for visual QA using the same LibreOffice service.
        if (!remote) await require("../src/services/officeConversionService").convertToPdf(path.join(folder, "mixed-content.pptx"), folder);
        console.log(`PPTX ${remote ? "mocked R2" : "local"} HTTP, batch, queue, validation, failure and cleanup tests passed`);
        if (process.env.KEEP_PRESENTATION_TEST) console.log(`Artifacts: ${folder}`);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        for (const name of (await names()).filter(name => !originalNames.includes(name))) {
            const target = path.resolve("uploads", name);
            if (path.dirname(target) === path.resolve("uploads")) await fs.rm(target, { force: true });
        }
        if (!process.env.KEEP_PRESENTATION_TEST) await fs.rm(folder, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
