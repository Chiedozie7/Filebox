const assert = require("node:assert/strict");
const fs = require("node:fs");
const childProcess = require("node:child_process");
const originalExec = childProcess.execFile;
const originalExists = fs.existsSync;
const callbacks = [];
childProcess.execFile = (...args) => callbacks.push(args.at(-1));
fs.existsSync = file => String(file).endsWith("office-queue-test.pdf") || originalExists(file);
const office = require("../src/services/officeConversionService");

(async () => {
    try {
        const first = office.convertToPdf("failed.docx", "uploads").catch(error => error);
        const second = office.convertToPdf("office-queue-test.docx", "uploads");
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(callbacks.length, 1, "shared profile runs only one subprocess");
        callbacks[0](Object.assign(new Error("simulated converter failure"), { code: 1 }));
        assert.ok(await first instanceof Error);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(callbacks.length, 2, "failed conversion releases serialization lock");
        callbacks[1](null, "", "");
        assert.ok((await second).outputPath.endsWith("office-queue-test.pdf"));
        console.log("Office serialization and failure release checks passed");
    } finally {
        childProcess.execFile = originalExec;
        fs.existsSync = originalExists;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
