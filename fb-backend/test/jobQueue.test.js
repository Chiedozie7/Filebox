const assert = require("node:assert/strict");
const express = require("express");
const { createJobQueue } = require("../src/middleware/jobQueue");

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

const waitFor = async (condition) => {
    const deadline = Date.now() + 3000;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for queue state");
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

const withServer = async (configure, check) => {
    const app = express();
    app.use(express.json());
    configure(app);
    app.use((error, req, res, next) => { res.status(500).json({ error: error.message }); });
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try { await check(base); }
    finally { await new Promise(resolve => server.close(resolve)); }
};

(async () => {
    {
        const queue = createJobQueue({ veryHeavyConcurrency: 1 });
        const gates = [deferred(), deferred()];
        const started = [];
        await withServer(app => app.post("/very-heavy", queue.veryHeavy, queue.run(async (req, res) => {
            const index = started.length;
            started.push(index);
            await gates[index].promise;
            res.json({ index });
        })), async base => {
            const first = fetch(`${base}/very-heavy`, { method: "POST" });
            await waitFor(() => started.length === 1);
            const second = fetch(`${base}/very-heavy`, { method: "POST" });
            await waitFor(() => queue.stats().veryHeavy.waiting === 1);
            assert.equal(started.length, 1, "very-heavy jobs run one at a time");
            gates[0].resolve();
            assert.equal((await first).status, 200);
            await waitFor(() => started.length === 2);
            gates[1].resolve();
            assert.equal((await second).status, 200);
            assert.equal(queue.stats().veryHeavy.active, 0);
        });
    }

    {
        const queue = createJobQueue({ heavyConcurrency: 2 });
        const gates = [deferred(), deferred(), deferred()];
        let started = 0;
        await withServer(app => {
            app.post("/heavy", queue.heavy, queue.run(async (req, res) => {
                const index = started++;
                await gates[index].promise;
                res.json({ index });
            }));
            app.get("/light", (req, res) => res.json({ ok: true }));
        }, async base => {
            const first = fetch(`${base}/heavy`, { method: "POST" });
            const second = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => started === 2);
            const third = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => queue.stats().heavy.waiting === 1);
            assert.equal(started, 2, "heavy jobs allow two concurrent jobs");
            assert.equal((await fetch(`${base}/light`)).status, 200, "light routes bypass the queue");
            gates[0].resolve();
            assert.equal((await first).status, 200);
            await waitFor(() => started === 3);
            gates[1].resolve();
            gates[2].resolve();
            assert.equal((await second).status, 200);
            assert.equal((await third).status, 200);
            assert.equal(queue.stats().heavy.active, 0);
        });
    }

    {
        const queue = createJobQueue({ heavyConcurrency: 1 });
        const gate = deferred();
        let started = 0;
        await withServer(app => app.post("/heavy", queue.heavy, queue.run(async (req, res) => {
            started++;
            if (started === 1) {
                await gate.promise;
                throw new Error("expected processing failure");
            }
            res.json({ ok: true });
        })), async base => {
            const first = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => started === 1);
            const second = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => queue.stats().heavy.waiting === 1);
            gate.resolve();
            assert.equal((await first).status, 500);
            assert.equal((await second).status, 200, "failure releases the slot");
            assert.equal(queue.stats().heavy.active, 0);
        });
    }

    {
        const queue = createJobQueue({ heavyConcurrency: 1 });
        const gate = deferred();
        let filesProcessed = 0;
        let batchesStarted = 0;
        await withServer(app => app.post("/batch", queue.heavy, queue.run(async (req, res) => {
            batchesStarted++;
            for (const file of req.body.files) {
                filesProcessed++;
                if (batchesStarted === 1 && filesProcessed === 1) await gate.promise;
            }
            res.json({ count: req.body.files.length });
        })), async base => {
            const options = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: ["a", "b"] }) };
            const first = fetch(`${base}/batch`, options);
            await waitFor(() => filesProcessed === 1);
            const second = fetch(`${base}/batch`, options);
            await waitFor(() => queue.stats().heavy.waiting === 1);
            assert.equal(queue.stats().heavy.active, 1, "one batch occupies one slot");
            gate.resolve();
            assert.deepEqual(await (await first).json(), { count: 2 });
            assert.deepEqual(await (await second).json(), { count: 2 });
            assert.equal(filesProcessed, 4);
        });
    }

    {
        const queue = createJobQueue({ heavyConcurrency: 1, maxWaiting: 1 });
        const gates = [deferred(), deferred()];
        let started = 0;
        await withServer(app => app.post("/heavy", queue.heavy, queue.run(async (req, res) => {
            const index = started++;
            await gates[index].promise;
            res.json({ index });
        })), async base => {
            const first = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => started === 1);
            const second = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => queue.stats().waiting === 1);
            const full = await fetch(`${base}/heavy`, { method: "POST" });
            assert.equal(full.status, 503);
            assert.equal((await full.json()).error, "Job queue is full");
            gates[0].resolve();
            assert.equal((await first).status, 200);
            await waitFor(() => started === 2);
            gates[1].resolve();
            assert.equal((await second).status, 200);
        });
    }

    {
        const queue = createJobQueue({ veryHeavyConcurrency: 1, maxWaiting: 1 });
        const gate = deferred();
        let started = 0;
        await withServer(app => app.post("/very-heavy", queue.veryHeavy, queue.run(async (req, res) => {
            started++;
            if (started === 1) await gate.promise;
            if (!res.destroyed) res.json({ ok: true });
        })), async base => {
            const first = fetch(`${base}/very-heavy`, { method: "POST" });
            await waitFor(() => started === 1);
            const abort = new AbortController();
            const waiting = fetch(`${base}/very-heavy`, { method: "POST", signal: abort.signal }).catch(() => {});
            await waitFor(() => queue.stats().waiting === 1);
            abort.abort();
            await waiting;
            await waitFor(() => queue.stats().waiting === 0);
            const next = fetch(`${base}/very-heavy`, { method: "POST" });
            await waitFor(() => queue.stats().waiting === 1);
            gate.resolve();
            assert.equal((await first).status, 200);
            assert.equal((await next).status, 200);
            assert.equal(queue.stats().veryHeavy.active, 0);
        });
    }

    {
        const queue = createJobQueue({ heavyConcurrency: 1 });
        const gate = deferred();
        let started = 0;
        await withServer(app => app.post("/heavy", queue.heavy, queue.run(async (req, res) => {
            started++;
            if (started === 1) await gate.promise;
            if (!res.destroyed) res.json({ ok: true });
        })), async base => {
            const abort = new AbortController();
            const first = fetch(`${base}/heavy`, { method: "POST", signal: abort.signal }).catch(() => {});
            await waitFor(() => started === 1);
            const second = fetch(`${base}/heavy`, { method: "POST" });
            await waitFor(() => queue.stats().waiting === 1);
            abort.abort();
            await first;
            assert.equal(queue.stats().heavy.active, 1, "disconnected active work keeps its slot until it ends");
            gate.resolve();
            assert.equal((await second).status, 200, "the slot opens after disconnected work ends");
            assert.equal(queue.stats().heavy.active, 0);
        });
    }

    console.log("Job queue concurrency, waiting, failure, batch, light-route, full-queue, and disconnect checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
