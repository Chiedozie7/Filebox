const express = require("express");
const cors = require("cors");

const fileRoutes = require("./routes/fileRoutes");
const { trustedProxyHops } = require("./middleware/rateLimits");
const temporaryFileCleanup = require("./services/temporaryFileCleanup");
const logger = require("./services/logger");
const { httpLogger } = require("./middleware/httpLogger");

const app = express();
if (trustedProxyHops) app.set("trust proxy", trustedProxyHops);

app.use(httpLogger);
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
    });
});

app.get("/", (req, res) => {
    res.json({ message: "Filebox API is running" });
});

app.use("/files", temporaryFileCleanup.trackRequest, fileRoutes);

app.use((error, req, res, next) => {
    logger.error("http_unhandled_error", { error });
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({ error: status < 500 ? "Invalid request" : "Internal server error" });
});

module.exports = app;
