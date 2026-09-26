process.env.FILE_STORAGE_MODE = "local";
process.env.RATE_LIMIT_LIGHT_MAX = "1000";
process.env.NODE_ENV = "production";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
process.chdir(path.resolve(__dirname, ".."));
const app = require("../src/app");

const uploadsDir = path.resolve("uploads");
const fixtureDir = path.resolve(__dirname, "../../test-files/manual-QA/count-50-zip");
const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp",
    avif: "image/avif", tiff: "image/tiff" };
const names = async () => new Set(await fs.readdir(uploadsDir));
const added = async before => [...await names()].filter(name => !before.has(name));
const waitFor = async (check, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${label}`);
};
const zipNames = buffer => {
    let end = -1;
    for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
    }
    assert.ok(end >= 0, "ZIP has a central directory");
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);
    const entries = [];
    for (let index = 0; index < count; index++) {
        assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
        const length = buffer.readUInt16LE(offset + 28);
        entries.push(buffer.subarray(offset + 46, offset + 46 + length).toString());
        offset += 46 + length + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    }
    return entries;
};

(async () => {
    await fs.mkdir(uploadsDir, { recursive: true });
    const original = await names();
    const files = (await fs.readdir(fixtureDir)).sort();
    assert.equal(files.length, 50);
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async selected => {
        const before = await names();
        const form = new FormData();
        for (const name of selected) {
            const extension = path.extname(name).slice(1);
            const source = name === "animated.gif"
                ? path.resolve(__dirname, "../../test-files/animated.gif")
                : path.join(fixtureDir, name);
            form.append("files", new Blob([await fs.readFile(source)],
                { type: mime[extension] || "image/gif" }), name);
        }
        const response = await fetch(`${base}/files/zip`, { method: "POST", body: form,
            signal: AbortSignal.timeout(120000) });
        return { before, status: response.status, body: await response.json() };
    };
    try {
        const success = await post(files);
        assert.equal(success.status, 200, JSON.stringify(success.body));
        assert.equal(success.body.files.length, 50);
        assert.deepEqual(await added(success.before), [success.body.zip],
            "all 50 uploaded inputs are gone when the ZIP response arrives");
        const zip = await fs.readFile(path.join(uploadsDir, success.body.zip));
        assert.ok(zip.length > 0);
        assert.deepEqual(zipNames(zip).sort(), files);

        const failure = await post([...files.slice(0, 49), "animated.gif"]);
        assert.equal(failure.status, 400, JSON.stringify(failure.body));
        await waitFor(async () => (await added(failure.before)).length === 0,
            "rejected ZIP inputs to be removed");

        const beforeAbort = await names();
        const request = http.request(`${base}/files/zip`, {
            method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=zip-cleanup-boundary" },
        });
        request.on("error", () => {});
        for (const name of files.slice(0, 5)) {
            request.write(`--zip-cleanup-boundary\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: ${mime[path.extname(name).slice(1)]}\r\n\r\n`);
            request.write(await fs.readFile(path.join(fixtureDir, name)));
            request.write("\r\n");
        }
        request.write(`--zip-cleanup-boundary\r\nContent-Disposition: form-data; name="files"; filename="${files[5]}"\r\nContent-Type: image/jpeg\r\n\r\n`);
        request.write((await fs.readFile(path.join(fixtureDir, files[5]))).subarray(0, 16384));
        await waitFor(async () => (await added(beforeAbort)).length >= 5, "ZIP upload to begin");
        request.destroy();
        await waitFor(async () => (await added(beforeAbort)).length === 0,
            "disconnected ZIP inputs to be removed");
        console.log("Standalone ZIP 50-file success, rejection, and disconnect cleanup passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
        for (const name of await added(original)) {
            const filePath = path.resolve(uploadsDir, name);
            if (path.dirname(filePath) === uploadsDir) await fs.rm(filePath, { force: true });
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
