const r2 = require("../services/r2Service");
const config = require("../config/r2");
const logger = require("../services/logger");

const unavailable = (res) => res.status(503).json({ error: "R2 storage is not configured" });

const createUploadUrl = async (req, res) => {
    if (!config.enabled) return unavailable(res);
    try {
        const result = await r2.createUpload(req.body || {});
        res.json(result);
    } catch (error) {
        logger.error("r2_upload_url_generation_failed", { error });
        res.status(400).json({ error: error.message });
    }
};

const createDownloadUrl = async (req, res) => {
    if (!config.enabled) return unavailable(res);
    try {
        res.json(await r2.downloadUrl(req.body?.object));
    } catch (error) {
        logger.error("r2_download_url_generation_failed", { error });
        res.status(400).json({ error: error.message });
    }
};

module.exports = { createUploadUrl, createDownloadUrl };
