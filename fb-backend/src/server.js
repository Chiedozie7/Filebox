require("dotenv").config();

const app = require("./app");
const temporaryFileCleanup = require("./services/temporaryFileCleanup");
const logger = require("./services/logger");
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    logger.info("server_started", { port: PORT, environment: process.env.NODE_ENV || "development" });
    temporaryFileCleanup.start().catch((error) => logger.error("startup_cleanup_failed", { error }));
});
