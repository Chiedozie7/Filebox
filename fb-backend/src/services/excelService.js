const officeConversionService = require("./officeConversionService");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const JSZip = require("jszip"); // Already supplied by ExcelJS.

const setPrintAttributes = (tag, attributes) => {
    for (const [name, value] of Object.entries(attributes)) {
        tag = tag.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "g"), "");
        if (value !== null) {
            tag = tag.replace(/\s*\/?>$/, (ending) => ` ${name}="${value}"${ending}`);
        }
    }
    return tag;
};

const fitWorksheetToPageWidth = (xml) => {
    // Edit only print metadata: loading/saving with ExcelJS can discard charts.
    const root = xml.match(/<((?:[\w.-]+:)?worksheet)\b[^>]*>/);
    if (!root) return xml;
    const prefix = root[1].slice(0, -"worksheet".length);
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tagPattern = (name) => new RegExp(`<${escapedPrefix}${name}\\b[^>]*>`);
    const pageSetup = tagPattern("pageSetup");
    const attributes = { scale: null, fitToWidth: "1", fitToHeight: "0" };

    if (pageSetup.test(xml)) {
        xml = xml.replace(pageSetup, (tag) => setPrintAttributes(tag, attributes));
    } else {
        const setup = `<${prefix}pageSetup fitToWidth="1" fitToHeight="0"/>`;
        const margins = new RegExp(`<${escapedPrefix}pageMargins\\b[^>]*(?:/>|>[\\s\\S]*?</${escapedPrefix}pageMargins>)`);
        if (margins.test(xml)) {
            xml = xml.replace(margins, (tag) => `${tag}${setup}`);
        } else {
            // Insert before the first subsequent direct worksheet child. Avoid
            // matching nested extLst elements in cells or conditional formats.
            const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>/g;
            const subsequent = new RegExp(`^<${escapedPrefix}(?:headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\\b|^</${escapedPrefix}worksheet>`);
            let depth = 0;
            for (const match of xml.matchAll(tags)) {
                const tag = match[0];
                if (/^<[!?]/.test(tag)) continue;
                if (depth === 1 && subsequent.test(tag)) {
                    xml = xml.slice(0, match.index) + setup + xml.slice(match.index);
                    break;
                }
                if (/^<\//.test(tag)) depth--;
                else if (!/\/>$/.test(tag)) depth++;
            }
        }
    }

    const sheetPr = tagPattern("sheetPr");
    const pageSetUpPr = `<${prefix}pageSetUpPr fitToPage="1"/>`;
    if (!sheetPr.test(xml)) {
        return xml.replace(root[0], `${root[0]}<${prefix}sheetPr>${pageSetUpPr}</${prefix}sheetPr>`);
    }
    const properties = new RegExp(`<${escapedPrefix}sheetPr\\b[^>]*(?:/>|>[\\s\\S]*?</${escapedPrefix}sheetPr>)`);
    return xml.replace(properties, (block) => {
        const setupPr = tagPattern("pageSetUpPr");
        if (setupPr.test(block)) {
            return block.replace(setupPr, (tag) => setPrintAttributes(tag, { fitToPage: "1" }));
        }
        if (/\/>$/.test(block)) {
            return block.replace(/\/>$/, `>${pageSetUpPr}</${prefix}sheetPr>`);
        }
        return block.replace(`</${prefix}sheetPr>`, `${pageSetUpPr}</${prefix}sheetPr>`);
    });
};

const convertExcelToPdf = async (inputPath, outputDir) => {
    const archive = await JSZip.loadAsync(await fs.readFile(inputPath));
    const worksheets = archive.file(/^xl\/worksheets\/[^/]+\.xml$/);
    for (const worksheet of worksheets) {
        archive.file(worksheet.name, fitWorksheetToPageWidth(await worksheet.async("string")), { createFolders: false });
    }

    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileforge-excel-pdf-"));
    try {
        // Keep the basename so the existing output filename contract stays intact.
        const preparedPath = path.join(temporaryDir, path.basename(inputPath));
        await fs.writeFile(preparedPath, await archive.generateAsync({ type: "nodebuffer" }));
        return await officeConversionService.convertToPdf(preparedPath, outputDir);
    } finally {
        await fs.rm(temporaryDir, { recursive: true, force: true });
    }
};

module.exports = {
    convertExcelToPdf,
};
