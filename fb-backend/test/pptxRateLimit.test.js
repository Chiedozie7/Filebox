const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

process.chdir(path.resolve(__dirname, ".."));
Object.assign(process.env, {
    FILE_STORAGE_MODE: "local",
    NODE_ENV: "production",
    TRUST_PROXY_HOPS: "1",
    RATE_LIMIT_VERY_HEAVY_MAX: "1",
});

const presentation = require("../src/services/presentationService");
const calls = { pptxToPdf: 0, pdfToPptx: 0 };
presentation.convertPptxToPdf = async (inputPath) => {
    calls.pptxToPdf++;
    const outputPath = path.join("uploads", `${path.parse(inputPath).name}.pdf`);
    await fs.writeFile(outputPath, "%PDF-1.4 mock output");
    return { outputPath };
};
presentation.convertPdfToPptx = async (_inputPath, outputPath) => {
    calls.pdfToPptx++;
    await fs.writeFile(outputPath, "mock pptx output");
    return { outputPath, slideCount: 1 };
};

const app = require("../src/app");
const queue = require("../src/middleware/jobQueue");
const fixtureDir = path.resolve("../test-files");
const pptxFixture = path.join(fixtureDir, "manual-QA", "pptx-conversion-test.pptx");
const pdfFixture = path.join(fixtureDir, "mixed-content.pdf");
const mime = {
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pdf: "application/pdf",
};

async function submit(base, route, fixture, extension, clientIp) {
    const form = new FormData();
    form.append("file", new Blob([await fs.readFile(fixture)], { type: mime[extension] }), `test.${extension}`);
    return fetch(`${base}${route}`, {
        method: "POST",
        headers: { "x-forwarded-for": clientIp },
        body: form,
    });
}

async function verifyRoute(base, { route, fixture, extension, ip, counter }) {
    const allowed = await submit(base, route, fixture, extension, ip);
    assert.equal(allowed.status, 200, `${route} first request should pass`);
    const success = await allowed.json();
    assert.match(success.message, /converted to .* successfully/);
    assert.equal(calls[counter], 1, `${route} should convert once`);
    await fs.rm(path.join("uploads", success.converted), { force: true });

    const rejected = await submit(base, route, fixture, extension, ip);
    assert.equal(rejected.status, 429, `${route} second request should be limited`);
    const body = await rejected.json();
    assert.equal(body.error, "Rate limit exceeded");
    assert.match(body.message, /processing jobs/);
    assert.doesNotMatch(JSON.stringify(body), /converted successfully/);
    assert.equal(calls[counter], 1, `${route} controller must not run after 429`);
    assert.equal(queue.stats().veryHeavy.active, 0, `${route} should not hold a queue slot`);
}

(async () => {
    const before = new Set(await fs.readdir("uploads"));
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await verifyRoute(base, {
            route: "/files/pptx/to-pdf", fixture: pptxFixture,
            extension: "pptx", ip: "203.0.113.31", counter: "pptxToPdf",
        });
        await verifyRoute(base, {
            route: "/files/pdf/to-pptx", fixture: pdfFixture,
            extension: "pdf", ip: "203.0.113.32", counter: "pdfToPptx",
        });
        console.log("PPTX conversion rate-limit short-circuit checks passed");
    } finally {
        await new Promise(resolve => server.close(resolve));
        for (const name of await fs.readdir("uploads")) {
            if (!before.has(name)) await fs.rm(path.join("uploads", name), { force: true });
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
