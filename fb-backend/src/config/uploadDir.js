const os = require("os");
const path = require("path");

const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(__dirname, "../../uploads"));
const tempRoot = path.resolve(os.tmpdir());
const relativeToTemp = path.relative(tempRoot, uploadDir);
const isEphemeral = relativeToTemp === "" || (relativeToTemp !== ".." && !relativeToTemp.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToTemp));

module.exports = { uploadDir, isEphemeral };
