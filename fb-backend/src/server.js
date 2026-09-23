require("dotenv").config();

const app = require("./app");
const temporaryFileCleanup = require("./services/temporaryFileCleanup");
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    temporaryFileCleanup.start().catch((error) => console.error("Startup cleanup failed:", error));
});
