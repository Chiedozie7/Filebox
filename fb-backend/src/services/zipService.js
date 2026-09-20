const { ZipArchive } = require("archiver");
const fs = require("fs");
const path = require("path");

const createZip = (filePaths, outputPath) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on("close", () => {
            resolve({ outputPath, totalBytes: archive.pointer() });
        });

        archive.on("error", (error) => {
            reject(error);
        });

        archive.pipe(output);

        filePaths.forEach((filePath) => {
            archive.file(filePath, { name: path.basename(filePath) });
        });

        archive.finalize();
    });
};

module.exports = {
    createZip,
};
