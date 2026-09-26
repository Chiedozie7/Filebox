const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const app = require("./app");
const temporaryFileCleanup = require("./services/temporaryFileCleanup");
const logger = require("./services/logger");
const storageConfig = require("./config/r2");
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    logger.info("server_started", { port: PORT, environment: process.env.NODE_ENV || "development" });
    if (process.env.NODE_ENV !== "production") {
        logger.info("storage_mode_resolved", { mode: storageConfig.mode });
    }
    temporaryFileCleanup.start().catch((error) => logger.error("startup_cleanup_failed", { error }));
});
