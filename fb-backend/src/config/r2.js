const mode = process.env.FILE_STORAGE_MODE || "local";
const required = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_REF_SIGNING_SECRET"];

if (!["local", "r2"].includes(mode)) throw new Error("FILE_STORAGE_MODE must be local or r2");
if (mode === "r2") {
    const missing = required.filter(name => !process.env[name]);
    if (missing.length) throw new Error(`Missing R2 configuration: ${missing.join(", ")}`);
}

const seconds = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 3600) : fallback;
};

module.exports = {
    mode,
    enabled: mode === "r2",
    accountId: process.env.R2_ACCOUNT_ID,
    bucket: process.env.R2_BUCKET,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    signingSecret: process.env.R2_REF_SIGNING_SECRET,
    uploadUrlSeconds: seconds("R2_UPLOAD_URL_SECONDS", 300),
    downloadUrlSeconds: seconds("R2_DOWNLOAD_URL_SECONDS", 300),
};
