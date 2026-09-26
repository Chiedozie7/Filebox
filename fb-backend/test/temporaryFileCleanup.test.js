const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { createCleanupService, DEFAULT_TTL_MS, TEMP_PREFIXES } = require("../src/services/temporaryFileCleanup");

const oldTime = new Date(Date.now() - 31 * 60 * 1000);
const makeOld = (filePath) => fs.utimes(filePath, oldTime, oldTime);
const exists = async (filePath) => fs.access(filePath).then(() => true, () => false);

(async () => {
    assert.equal(DEFAULT_TTL_MS, 30 * 60 * 1000);
    const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fileforge-cleanup-test-"));
    const uploadsDir = path.join(testRoot, "uploads");
    const tempRoot = path.join(testRoot, "system-temp");
    await fs.mkdir(uploadsDir);
    await fs.mkdir(tempRoot);
    const service = createCleanupService({
        uploadsDir,
        tempRoot,
        getPermanentNames: async () => ["permanent.docx"],
        logger: { error: () => {}, warn: () => {} },
    });
    try {
        const staleInput = path.join(uploadsDir, "old-input.pdf");
        const staleOutput = path.join(uploadsDir, "old-output.zip");
        const recentOutput = path.join(uploadsDir, "recent-output.pdf");
        const permanent = path.join(uploadsDir, "permanent.docx");
        for (const filePath of [staleInput, staleOutput, recentOutput, permanent]) {
            await fs.writeFile(filePath, "fixture");
        }
        for (const filePath of [staleInput, staleOutput, permanent]) await makeOld(filePath);
        const orphanDirs = [];
        for (const prefix of TEMP_PREFIXES) {
            const directory = path.join(tempRoot, prefix + "orphan");
            await fs.mkdir(directory);
            await fs.writeFile(path.join(directory, "page.tmp"), "fixture");
            await makeOld(directory);
            orphanDirs.push(directory);
        }
        const unrelatedDir = path.join(tempRoot, "other-project");
        await fs.mkdir(unrelatedDir);
        await makeOld(unrelatedDir);

        const firstSweep = await service.sweep();
        assert.equal(firstSweep.files, 2, "stale upload inputs and outputs are deleted");
        assert.equal(firstSweep.directories, TEMP_PREFIXES.length, "known orphan temp directories are deleted");
        assert.equal(await exists(staleInput), false);
        assert.equal(await exists(staleOutput), false);
        assert.equal(await exists(recentOutput), true, "recent output is preserved");
        assert.equal(await exists(permanent), true, "database-backed permanent upload is preserved");
        for (const directory of orphanDirs) assert.equal(await exists(directory), false);
        assert.equal(await exists(unrelatedDir), true, "unrelated temp directory is preserved");

        const startupOrphan = path.join(uploadsDir, "startup-orphan.pdf");
        await fs.writeFile(startupOrphan, "fixture");
        await makeOld(startupOrphan);
        await service.start();
        assert.equal(await exists(startupOrphan), false, "startup scan removes stale files");
        service.stop();

        const activeFile = path.join(uploadsDir, "active.pdf");
        await fs.writeFile(activeFile, "fixture");
        await makeOld(activeFile);
        const activeJob = await service.beginJob();
        assert.equal((await service.sweep()).skippedActive, true);
        assert.equal(await exists(activeFile), true, "active job prevents deletion");
        await service.finishJob(activeJob);
        assert.equal(await exists(activeFile), false, "deferred sweep runs after the active job ends");

        const failedInput = path.join(uploadsDir, "failed-input.pdf");
        const failedOutput = path.join(uploadsDir, "failed-output.docx");
        const outsideFile = path.join(tempRoot, "keep-fixture.txt");
        for (const filePath of [failedInput, failedOutput, outsideFile]) await fs.writeFile(filePath, "fixture");
        const failedJob = await service.beginJob();
        service.registerOutput({ cleanupJob: failedJob }, failedOutput);
        await service.finishJob(failedJob, { failed: true, inputPaths: [failedInput, outsideFile] });
        assert.equal(await exists(failedInput), false, "failed upload input is removed");
        assert.equal(await exists(failedOutput), false, "failed partial output is removed");
        assert.equal(await exists(outsideFile), true, "files outside uploads are never removed");

        const successfulInput = path.join(uploadsDir, "successful-input.jpg");
        const successfulOutput = path.join(uploadsDir, "successful-output.jpg");
        const batchMember = path.join(uploadsDir, "batch-member.jpg");
        for (const filePath of [successfulInput, successfulOutput, batchMember]) await fs.writeFile(filePath, "fixture");
        const successfulJob = await service.beginJob();
        service.registerInput({ cleanupJob: successfulJob }, successfulInput);
        service.registerOutput({ cleanupJob: successfulJob }, successfulOutput);
        service.registerOutput({ cleanupJob: successfulJob }, batchMember, { discardOnSuccess: true });
        await service.finishJob(successfulJob);
        assert.equal(await exists(successfulInput), false, "successful processing removes its uploaded input");
        assert.equal(await exists(batchMember), false, "successful batch removes intermediate output");
        assert.equal(await exists(successfulOutput), true, "named output remains for local download");

        const permanentInput = path.join(uploadsDir, "permanent-upload.jpg");
        await fs.writeFile(permanentInput, "fixture");
        const permanentJob = await service.beginJob();
        service.registerInput({ cleanupJob: permanentJob }, permanentInput);
        permanentJob.keepInputs = true;
        await service.finishJob(permanentJob, { failed: true });
        assert.equal(await exists(permanentInput), true, "database-saved permanent upload survives a lost response");

        const app = express();
        app.get("/fail", service.trackRequest, service.trackProcessing(async (req, res) => {
            const input = path.join(uploadsDir, "http-failed-input.pdf");
            const output = path.join(uploadsDir, "http-failed-output.docx");
            req.file = { path: input };
            service.registerOutput(req, output);
            await fs.writeFile(input, "fixture");
            await fs.writeFile(output, "fixture");
            res.status(500).json({ error: "simulated conversion failure" });
        }));
        const server = await new Promise(resolve => {
            const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
        });
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/fail`);
            assert.equal(response.status, 500);
            await response.arrayBuffer();
            for (let attempt = 0; attempt < 20 && await exists(path.join(uploadsDir, "http-failed-output.docx")); attempt++) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.equal(await exists(path.join(uploadsDir, "http-failed-input.pdf")), false);
            assert.equal(await exists(path.join(uploadsDir, "http-failed-output.docx")), false);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }

        const uncertainFile = path.join(uploadsDir, "database-unavailable.pdf");
        const crashDirectory = path.join(tempRoot, "fileforge-ocr-database-outage");
        await fs.writeFile(uncertainFile, "fixture");
        await makeOld(uncertainFile);
        await fs.mkdir(crashDirectory);
        await makeOld(crashDirectory);
        const databaseDownService = createCleanupService({
            uploadsDir,
            tempRoot,
            getPermanentNames: async () => { throw new Error("database unavailable"); },
            logger: { error: () => {}, warn: () => {} },
        });
        await databaseDownService.sweep();
        assert.equal(await exists(uncertainFile), true, "upload files are preserved when permanent-file lookup fails");
        assert.equal(await exists(crashDirectory), false, "known temp directories still get cleaned");
        console.log("Temporary-file cleanup checks passed");
    } finally {
        service.stop();
        // This exact directory was created by the test under the OS temp root.
        if (path.dirname(path.resolve(testRoot)) === path.resolve(os.tmpdir())) {
            await fs.rm(testRoot, { recursive: true, force: true });
        }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
