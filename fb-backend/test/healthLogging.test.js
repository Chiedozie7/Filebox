const assert = require("node:assert/strict");
const app = require("../src/app");
const logger = require("../src/services/logger");
const queue = require("../src/middleware/jobQueue");

(async () => {
    const lines = [];
    const testLogger = logger.createLogger({ environment: "production", write: line => lines.push(line) });
    testLogger.runWithContext({ requestId: "request-123" }, () => testLogger.error("test_event", {
        downloadUrl: "https://storage.example/private?X-Amz-Signature=signature-secret",
        error: Object.assign(new Error("Request failed at https://storage.example/a?token=secret token=token-secret"), { code: "NoSuchKey" }),
        fileContents: "private document text",
        operation: "compress_png",
    }));
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "error");
    assert.equal(parsed.event, "test_event");
    assert.equal(parsed.requestId, "request-123");
    assert.equal(parsed.downloadUrl, "[REDACTED]");
    assert.equal(parsed.fileContents, "[REDACTED]");
    assert.equal(parsed.error.code, "NoSuchKey");
    assert.ok(!lines[0].includes("storage.example"));
    assert.ok(!lines[0].includes("signature-secret"));
    assert.ok(!lines[0].includes("token-secret"));
    assert.ok(!lines[0].includes("private document text"));

    const events = [];
    const originalInfo = logger.info;
    logger.info = (event, fields) => events.push({ event, ...fields });
    const originalQueue = queue.stats();
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/health`;
        let health;
        for (let index = 0; index < 65; index++) {
            const response = await fetch(endpoint);
            assert.equal(response.status, 200, `health request ${index + 1} is never rate-limited`);
            health = await response.json();
        }
        assert.equal(health.status, "ok");
        assert.equal(typeof health.uptime, "number");
        assert.ok(health.uptime >= 0);
        assert.equal(health.environment, process.env.NODE_ENV || "development");
        assert.ok(Number.isFinite(Date.parse(health.timestamp)));
        assert.deepEqual(queue.stats(), originalQueue, "health requests do not enter the job queue");

        const missing = await fetch(`http://127.0.0.1:${server.address().port}/files/download/logger-test-missing`);
        assert.equal(missing.status, 404);

        const completed = events.findLast(event => event.event === "http_request" && event.route === "/health");
        assert.equal(completed.method, "GET");
        assert.equal(completed.statusCode, 200);
        assert.ok(Number.isFinite(completed.durationMs));
        assert.equal(typeof completed.requestId, "string");
        assert.ok(events.some(event => event.event === "http_request" &&
            event.route === "/files/download/:filename" && event.statusCode === 404), "file routes are logged by route pattern");
        console.log("Health endpoint and structured logging checks passed");
    } finally {
        logger.info = originalInfo;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
