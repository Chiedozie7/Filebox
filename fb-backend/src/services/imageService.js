const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const getImageFormat = (filename) => {
    const extension = path.extname(filename).toLowerCase().replace(".", "");

    if (extension === "jpg") {
        return "jpeg";
    }

    return extension;
};

const compressImage = async (inputPath, outputPath, format) => {
    const image = sharp(inputPath);

    switch (format) {
        case "jpeg":
        case "jpg":
            await image.jpeg({
                quality: 70,
                mozjpeg: true,
            }).toFile(outputPath);
            break;

        case "png":
            await image.png({
                compressionLevel: 9,
                palette: true,
            }).toFile(outputPath);
            break;

        case "webp":
            await image.webp({
                quality: 70,
            }).toFile(outputPath);
            break;

        case "avif":
            await image.avif({
                quality: 50,
            }).toFile(outputPath);
            break;

        case "tiff":
            await image.tiff({
                compression: "jpeg",
                quality: 70,
            }).toFile(outputPath);
            break;

        case "gif":
            await image.gif().toFile(outputPath);
            break;

        default:
            throw new Error("Unsupported image format");
    }

    const originalSize = fs.statSync(inputPath).size;
    const compressedSize = fs.statSync(outputPath).size;
    const savedBytes = originalSize - compressedSize;

    const reductionPercentage =
        ((savedBytes / originalSize) * 100).toFixed(1);

    return {
        originalSize,
        compressedSize,
        savedBytes,
        reductionPercentage,
    };
};

const resizeImage = async (inputPath, outputPath, width, height) => {
    const originalMetadata = await sharp(inputPath).metadata();

    await sharp(inputPath)
        .resize({
            width: width || undefined,
            height: height || undefined,
            fit: "inside",
            withoutEnlargement: true,
        })
        .toFile(outputPath);

    const resizedMetadata = await sharp(outputPath).metadata();

    return {
        originalWidth: originalMetadata.width,
        originalHeight: originalMetadata.height,
        resizedWidth: resizedMetadata.width,
        resizedHeight: resizedMetadata.height,
    };
};

module.exports = {
    compressImage,
    resizeImage,
    getImageFormat
};