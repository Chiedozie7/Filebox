process.env.FILE_STORAGE_MODE = "local";
process.env.RATE_LIMIT_HEAVY_MAX = "20";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
process.chdir(path.resolve(__dirname, ".."));
const app = require("../src/app");

const uploadsDir = path.resolve("uploads");
const fixturesDir = path.resolve(__dirname, "../../test-files");
const exists = filePath => fs.access(filePath).then(() => true, () => false);

(async () => {
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const outputs = [];
    const convert = async (sourceName, target) => {
        const form = new FormData();
        const bytes = await fs.readFile(path.join(fixturesDir, sourceName));
        const type = sourceName.endsWith(".jpg") ? "image/jpeg" : "image/png";
        form.append("file", new Blob([bytes], { type }), sourceName);
        form.append("format", target);
        const response = await fetch(`${base}/files/convert`, { method: "POST", body: form });
        const body = await response.json();
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.format, target === "jpg" ? "jpeg" : target);
        assert.ok(body.converted.endsWith(`.${target === "jpeg" ? "jpg" : target}`));
        const outputPath = path.join(uploadsDir, body.converted);
        outputs.push(outputPath);
        assert.equal((await sharp(await fs.readFile(outputPath)).metadata()).format,
            target === "avif" ? "heif" : target === "jpg" ? "jpeg" : target);
        const download = await fetch(`${base}/files/download/${body.converted}`);
        assert.equal(download.status, 200);
        assert.ok((await download.arrayBuffer()).byteLength > 0);
        return body;
    };
    try {
        const tiff = await convert("landscape.jpg", "tiff");
        const webp = await convert("landscape.jpg", "webp");
        assert.notEqual(tiff.converted, webp.converted);
        assert.notEqual(tiff.original, webp.original);
        const png = await convert("landscape.jpg", "png");
        const jpeg = await convert("landscape.jpg", "jpeg");
        assert.notEqual(png.converted, jpeg.converted);
        const avif = await convert("landscape.jpg", "avif");
        assert.notEqual(jpeg.converted, avif.converted);
        for (const body of [tiff, webp, png, jpeg, avif]) {
            for (let attempt = 0; attempt < 100 && await exists(path.join(uploadsDir, body.original)); attempt++) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(await exists(path.join(uploadsDir, body.original)), false, "uploaded input cleaned");
        }
        console.log("Sequential image conversion response metadata checks passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
        for (const output of outputs) {
            for (let attempt = 0; attempt < 100; attempt++) {
                try {
                    await fs.rm(output, { force: true });
                    break;
                } catch (error) {
                    if (!["EBUSY", "EPERM"].includes(error.code) || attempt === 99) throw error;
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
            }
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
