const fileRepository = require("../repositories/fileRepository");

const saveFile = async (file) => {
    return fileRepository.createFile({
        originalName: file.originalname,
        storedName: file.filename,
        fileType: file.mimetype,
        fileSize: file.size,
    });
};

const getFiles = async () => {
    return fileRepository.getAllFiles();
};

module.exports = {
    saveFile,
    getFiles,
};