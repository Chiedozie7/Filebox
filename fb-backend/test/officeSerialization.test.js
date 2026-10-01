const assert = require("node:assert/strict");
const fs = require("node:fs");
const childProcess = require("node:child_process");
const originalExec = childProcess.execFile;
const originalExists = fs.existsSync;
const originalSetTimeout = global.setTimeout;
const calls = [];
const warmupTimers = [];
global.setTimeout = (callback, delay, ...args) => {
    if (delay === 35000) warmupTimers.push(callback);
    return originalSetTimeout(callback, delay, ...args);
};
childProcess.execFile = (...args) => {
    calls.push(args);
    const options = args[2];
    const callback = args.at(-1);
    options.signal?.addEventListener("abort", () => callback(Object.assign(
        new Error("The operation was aborted"), { code: "ABORT_ERR" }
    )), { once: true });
};
fs.existsSync = file => String(file).endsWith("office-queue-test.pdf") ||
    String(file).endsWith("warmup.pdf") || originalExists(file);
const office = require("../src/services/officeConversionService");
assert.equal(office.resolveSofficePath("/usr/bin/soffice", "win32"), "/usr/bin/soffice", "environment override wins");
assert.equal(office.resolveSofficePath("", "linux"), "/usr/bin/soffice", "Linux fallback");
assert.equal(office.resolveSofficePath("", "win32"), "C:\\Program Files\\LibreOffice\\program\\soffice.exe", "Windows fallback");

const waitForCall = async (count) => {
    const deadline = Date.now() + 3000;
    while (calls.length < count) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for LibreOffice call ${count}`);
        await new Promise(resolve => setTimeout(resolve, 5));
    }
};

(async () => {
    try {
        const warmup = office.warmUp();
        await waitForCall(1);
        assert.ok(calls[0][1].at(-1).endsWith("warmup.txt"));
        assert.equal(calls[0][2].timeout, 35000);
        const userConversion = office.convertToPdf("office-queue-test.docx", "uploads");
        assert.deepEqual(await warmup, { skipped: true }, "user work preempts a running warm-up");
        await waitForCall(2);
        assert.equal(calls[1][2].timeout, 120000, "first user conversion keeps the normal timeout");
        calls[1].at(-1)(null, "", "");
        assert.ok((await userConversion).outputPath.endsWith("office-queue-test.pdf"));

        const first = office.convertToPdf("office-queue-test.docx", "uploads");
        const pendingWarmup = office.warmUp();
        const second = office.convertToPdf("office-queue-test.docx", "uploads");
        await waitForCall(3);
        calls[2].at(-1)(null, "", "");
        await first;
        assert.deepEqual(await pendingWarmup, { skipped: true }, "pending warm-up yields to queued user work");
        await waitForCall(4);
        assert.equal(calls[3][2].timeout, 120000);
        calls[3].at(-1)(null, "", "");
        await second;

        const failedWarmup = office.warmUp().catch(error => error);
        await waitForCall(5);
        calls[4].at(-1)(Object.assign(new Error("simulated warm-up failure"), { code: 1 }));
        assert.ok(await failedWarmup instanceof Error);
        const afterFailure = office.convertToPdf("office-queue-test.docx", "uploads");
        await waitForCall(6);
        assert.equal(calls[5][2].timeout, 120000);
        calls[5].at(-1)(null, "", "");
        await afterFailure;

        const timedOutWarmup = office.warmUp().catch(error => error);
        await waitForCall(7);
        warmupTimers.at(-1)();
        const timeoutError = await timedOutWarmup;
        assert.equal(timeoutError.code, "WARMUP_TIMEOUT");
        const afterTimeout = office.convertToPdf("office-queue-test.docx", "uploads");
        await waitForCall(8);
        assert.equal(calls[7][2].timeout, 120000);
        calls[7].at(-1)(null, "", "");
        await afterTimeout;
        assert.ok(calls.every(call => call[0] === office.sofficePath), "warm-up and conversions use the same executable");
        console.log("Office warm-up preemption, timeout, queue release, and user timeouts passed");
    } finally {
        childProcess.execFile = originalExec;
        fs.existsSync = originalExists;
        global.setTimeout = originalSetTimeout;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
