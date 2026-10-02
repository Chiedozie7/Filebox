const assert = require("node:assert/strict");
const { createCorsOptions, resolveAllowedOrigins } = require("../src/config/cors");
const logger = require("../src/services/logger");

const checkOrigin = (options, origin) => new Promise(resolve => {
    options.origin(origin, (error, allowed) => resolve({ error, allowed }));
});

(async () => {
    const development = createCorsOptions({ environment: "development", allowedOrigins: "" });
    assert.deepEqual(await checkOrigin(development, "http://localhost:3000"), { error: null, allowed: true });
    assert.deepEqual(await checkOrigin(development, "http://127.0.0.1:3001"), { error: null, allowed: true });
    assert.equal((await checkOrigin(development, "https://unexpected.example")).error.code, "CORS_ORIGIN_DENIED");

    const production = createCorsOptions({
        environment: "production", allowedOrigins: " https://frontend.example, https://preview.example/ ",
    });
    assert.deepEqual(await checkOrigin(production, "https://frontend.example"), { error: null, allowed: true });
    assert.equal((await checkOrigin(production, "http://localhost:3000")).error.code, "CORS_ORIGIN_DENIED");
    assert.deepEqual(await checkOrigin(production, undefined), { error: null, allowed: true });
    assert.throws(() => createCorsOptions({ environment: "production", allowedOrigins: "https://example.com/path" }), /origins without paths/);
    assert.deepEqual(resolveAllowedOrigins({ environment: "production",
        allowedOrigins: " https://filebox-yt.vercel.app/ , https://preview.example " }),
    ["https://filebox-yt.vercel.app", "https://preview.example"]);
    const lines = [];
    logger.createLogger({ environment: "production", write: line => lines.push(line) })
        .info("cors_allowed_origins_resolved", { allowedOrigins: ["https://filebox-yt.vercel.app",
            "https://storage.example/private?signature=secret"] });
    assert.deepEqual(JSON.parse(lines[0]).allowedOrigins,
        ["https://filebox-yt.vercel.app", "[REDACTED]"], "startup log exposes only validated public origins");

    process.chdir(require("node:path").resolve(__dirname, ".."));
    process.env.NODE_ENV = "production";
    process.env.FILE_STORAGE_MODE = "local";
    process.env.CORS_ALLOWED_ORIGINS = " https://filebox-yt.vercel.app/ ";
    const app = require("../src/app");
    const server = await new Promise(resolve => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const allowed = await fetch(`${base}/health`, { headers: { Origin: "https://filebox-yt.vercel.app" } });
        assert.equal(allowed.status, 200);
        assert.equal(allowed.headers.get("access-control-allow-origin"), "https://filebox-yt.vercel.app");
        assert.match(allowed.headers.get("vary"), /Origin/i);

        const preflight = await fetch(`${base}/files/r2/upload-url`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://filebox-yt.vercel.app",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-request-id",
            },
        });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get("access-control-allow-origin"), "https://filebox-yt.vercel.app");
        assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
        assert.match(preflight.headers.get("access-control-allow-headers"), /content-type/i);
        assert.match(preflight.headers.get("access-control-allow-headers"), /x-request-id/i);
        assert.match(preflight.headers.get("access-control-expose-headers"), /content-disposition/i);

        const denied = await fetch(`${base}/files/r2/upload-url`, {
            method: "POST",
            headers: { Origin: "https://unexpected.example", "Content-Type": "application/json" },
            body: "{}",
        });
        assert.equal(denied.status, 403);
        assert.deepEqual(await denied.json(), { error: "Origin not allowed" });
        assert.equal(denied.headers.get("access-control-allow-origin"), null);

        assert.equal((await fetch(`${base}/health`)).status, 200, "originless API clients remain supported");
        console.log("Development and production CORS checks passed");
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
