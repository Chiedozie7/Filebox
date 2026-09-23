const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

process.chdir(path.resolve(__dirname, ".."));
process.env.RATE_LIMIT_LIGHT_MAX = "60";
process.env.RATE_LIMIT_HEAVY_MAX = "5";
process.env.RATE_LIMIT_VERY_HEAVY_MAX = "3";
process.env.TRUST_PROXY_HOPS = "1";
const app = require("../src/app");

const ip = "203.0.113.10";
const otherIp = "203.0.113.11";
const fixtureDir = path.resolve(__dirname, "../../test-files");

async function request(base, route, options = {}, clientIp = ip) {
    return fetch(`${base}${route}`, {
        ...options,
        headers: { ...options.headers, "x-forwarded-for": clientIp },
    });
}

async function merge(base, filenames) {
    const form = new FormData();
    for (const filename of filenames) {
        const mime = filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
        form.append("files", new Blob([await fs.readFile(path.join(fixtureDir, filename))], { type: mime }), filename);
    }
    return request(base, "/files/pdf/merge", { method: "POST", body: form });
}

(async () => {
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (let n = 0; n < 59; n++) {
            const response = await request(base, "/files/download/missing-file");
            assert.equal(response.status, 404, `light request ${n + 1}`);
        }
        const sixtieth = await request(base, "/files/zip", { method: "POST" });
        assert.equal(sixtieth.status, 400, "light route 60 remains allowed");
        const lightBlocked = await request(base, "/files/download/missing-file");
        assert.equal(lightBlocked.status, 429, "light route 61 is throttled");
        assert.equal((await lightBlocked.json()).error, "Rate limit exceeded");
        assert.ok(lightBlocked.headers.get("retry-after"));
        assert.equal((await request(base, "/files/download/missing-file", {}, otherIp)).status, 404, "another IP has its own quota");

        for (let n = 0; n < 3; n++) {
            const response = await merge(base, ["mixed-content.pdf", "landscape.jpg"]);
            assert.equal(response.status, 200, `mixed merge ${n + 1} remains allowed`);
            assert.ok((await response.json()).merged);
        }
        const beforeBlockedMerge = (await fs.readdir("uploads")).sort();
        const mixedBlocked = await merge(base, ["mixed-content.pdf", "landscape.jpg"]);
        assert.equal(mixedBlocked.status, 429, "mixed merge 4 uses the very-heavy quota");
        assert.equal((await mixedBlocked.json()).error, "Rate limit exceeded");
        assert.deepEqual((await fs.readdir("uploads")).sort(), beforeBlockedMerge, "rejected mixed merge removes uploaded files");

        for (let n = 0; n < 5; n++) {
            const pdfOnly = await merge(base, ["mixed-content.pdf", "supplier-appendix.pdf"]);
            assert.equal(pdfOnly.status, 200, `PDF-only merge ${n + 1} is allowed under the heavy quota`);
            assert.ok((await pdfOnly.json()).merged);
        }
        const beforeBlockedPdfMerge = (await fs.readdir("uploads")).sort();
        const pdfMergeBlocked = await merge(base, ["mixed-content.pdf", "supplier-appendix.pdf"]);
        assert.equal(pdfMergeBlocked.status, 429, "PDF-only merge 6 exceeds the heavy quota");
        assert.equal((await pdfMergeBlocked.json()).error, "Rate limit exceeded");
        assert.deepEqual((await fs.readdir("uploads")).sort(), beforeBlockedPdfMerge, "rejected PDF-only merge removes uploaded files");
        const heavyBlocked = await request(base, "/files/compress", { method: "POST" });
        assert.equal(heavyBlocked.status, 429, "heavy quota is shared across routes");
        assert.equal((await heavyBlocked.json()).error, "Rate limit exceeded");

        const veryHeavyBlocked = await request(base, "/files/ocr/to-word", { method: "POST" });
        assert.equal(veryHeavyBlocked.status, 429, "very-heavy quota is shared with OCR");
        assert.equal((await veryHeavyBlocked.json()).error, "Rate limit exceeded");

        for (let n = 0; n < 5; n++) {
            const unlockAttempt = await request(base, "/files/pdf/unlock", { method: "POST" }, otherIp);
            assert.equal(unlockAttempt.status, 400, `PDF unlock heavy request ${n + 1} remains allowed`);
        }
        const unlockBlocked = await request(base, "/files/pdf/unlock", { method: "POST" }, otherIp);
        assert.equal(unlockBlocked.status, 429, "PDF unlock request 6 uses the heavy quota");
        assert.equal((await unlockBlocked.json()).error, "Rate limit exceeded");
        assert.equal((await request(base, "/files/download/missing-file", {}, otherIp)).status, 404, "unlock attempts do not consume the light quota");

        for (let n = 0; n < 65; n++) {
            assert.equal((await request(base, "/")).status, 200, `health request ${n + 1}`);
        }
        console.log("Rate-limit HTTP checks passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
