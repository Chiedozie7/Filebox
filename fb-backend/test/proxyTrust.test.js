const assert = require("node:assert/strict");

process.env.FILE_STORAGE_MODE = "local";
const configuredTrust = (value) => {
    if (value === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = value;
    delete require.cache[require.resolve("../src/middleware/rateLimits")];
    delete require.cache[require.resolve("../src/app")];
    return require("../src/app").get("trust proxy");
};

assert.equal(configuredTrust(), false, "local default does not trust proxies");
assert.equal(configuredTrust("1"), 1, "Pxxl trusts exactly one proxy hop");
assert.equal(configuredTrust("-1"), false, "invalid values do not enable proxy trust");
console.log("Configured proxy trust checks passed");
