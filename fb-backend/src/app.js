const express = require("express");
const cors = require("cors");

const fileRoutes = require("./routes/fileRoutes");
const { trustedProxyHops } = require("./middleware/rateLimits");
const temporaryFileCleanup = require("./services/temporaryFileCleanup");

const app = express();
if (trustedProxyHops) app.set("trust proxy", trustedProxyHops);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "Filebox API is running" });
});

app.use("/files", temporaryFileCleanup.trackRequest, fileRoutes);

module.exports = app;
