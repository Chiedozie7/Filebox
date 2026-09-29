import { FileBoxError } from "./errors";

export type StorageMode = "local" | "r2";
export type ToolId =
  | "image-compress" | "image-resize" | "image-convert"
  | "pdf-compress" | "pdf-split" | "pdf-merge" | "pdf-unlock"
  | "pdf-to-word" | "word-to-pdf" | "pdf-to-excel" | "excel-to-pdf"
  | "pdf-to-pptx" | "pptx-to-pdf" | "word-to-excel" | "excel-to-word"
  | "ocr-to-word" | "batch-convert" | "zip";
export type OptionName = "width" | "height" | "format" | "password" | "startPage" | "endPage" | "lang";

export interface ToolConfig {
  label: string;
  description: string;
  category: "Image" | "PDF" | "Convert" | "Other";
  endpoint: string;
  field: "file" | "files";
  acceptedExtensions: readonly string[];
  multiple: boolean;
  minFiles: number;
  targetFormat: { required: boolean; field: "format" | null; choices: readonly string[] };
  options: readonly OptionName[];
  outputField: "compressed" | "resized" | "converted" | "unlocked" | "merged" | "split" | "zip" | null;
  localBinary: boolean;
  related: readonly ToolId[];
  limits: {
    maxFiles: number;
    maxBytesPerFile: number;
    maxTotalBytes: number;
    bytesByExtension?: Readonly<Record<string, number>>;
    maxPdfPages?: number;
  };
}

const mb = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed * 1024 * 1024) : fallback * 1024 * 1024;
};
const count = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const image = mb(process.env.NEXT_PUBLIC_FILE_LIMIT_IMAGE_MB, 10);
const pdf = mb(process.env.NEXT_PUBLIC_FILE_LIMIT_PDF_MB, 50);
const office = mb(process.env.NEXT_PUBLIC_FILE_LIMIT_OFFICE_MB, 30);
const ocrPdf = mb(process.env.NEXT_PUBLIC_FILE_LIMIT_OCR_PDF_MB, 40);
const multiSettings = {
  merge: { maxFiles: count(process.env.NEXT_PUBLIC_FILE_LIMIT_MERGE_COUNT, 10),
    maxTotalBytes: mb(process.env.NEXT_PUBLIC_FILE_LIMIT_MERGE_TOTAL_MB, 100) },
  batch: { maxFiles: count(process.env.NEXT_PUBLIC_FILE_LIMIT_BATCH_COUNT, 10),
    maxTotalBytes: mb(process.env.NEXT_PUBLIC_FILE_LIMIT_BATCH_TOTAL_MB, 100) },
  zip: { maxFiles: count(process.env.NEXT_PUBLIC_FILE_LIMIT_ZIP_COUNT, 50),
    maxTotalBytes: mb(process.env.NEXT_PUBLIC_FILE_LIMIT_ZIP_TOTAL_MB, 200) },
};
const imageExt = ["jpg", "jpeg", "png", "webp", "avif", "tiff"];
const allExt = ["pdf", "docx", "xlsx", "pptx", ...imageExt];
const imageFormats = ["jpeg", "jpg", "png", "webp", "avif", "tiff"];
const mixedLimits = { pdf, docx: office, xlsx: office, pptx: office,
  jpg: image, jpeg: image, png: image, webp: image, avif: image, tiff: image };
const one = (maxBytesPerFile: number) => ({ maxFiles: 1, maxBytesPerFile, maxTotalBytes: maxBytesPerFile });
const multi = (kind: "merge" | "batch" | "zip") => ({
  maxFiles: multiSettings[kind].maxFiles,
  maxBytesPerFile: Math.max(image, pdf, office),
  maxTotalBytes: multiSettings[kind].maxTotalBytes,
  bytesByExtension: mixedLimits,
});
const noFormat = { required: false, field: null, choices: [] } as const;
const single = (label: string, description: string, category: ToolConfig["category"], endpoint: string,
  acceptedExtensions: readonly string[], maxBytes: number, outputField: ToolConfig["outputField"],
  related: readonly ToolId[], options: readonly OptionName[] = []): ToolConfig => ({
  label, description, category, endpoint, field: "file", acceptedExtensions, multiple: false,
  minFiles: 1, targetFormat: noFormat, options, outputField, localBinary: false, related,
  limits: one(maxBytes),
});

// Values mirror backend fileLimits.js defaults. Match public env overrides to backend overrides.
export const tools: Record<ToolId, ToolConfig> = {
  "image-compress": single("Compress image", "Reduce an image's file size.", "Image", "/files/compress", imageExt, image, "compressed", ["image-resize", "image-convert"]),
  "image-resize": single("Resize image", "Set a width, height, or both.", "Image", "/files/resize", imageExt, image, "resized", ["image-compress", "image-convert"], ["width", "height"]),
  "image-convert": { ...single("Convert image", "Save an image in another format.", "Image", "/files/convert", imageExt, image, "converted", ["image-compress", "image-resize"], ["format"]), targetFormat: { required: true, field: "format", choices: imageFormats } },
  "pdf-compress": single("Compress PDF", "Reduce a PDF's file size.", "PDF", "/files/pdf/compress", ["pdf"], pdf, "compressed", ["pdf-split", "pdf-merge"]),
  "pdf-split": single("Split PDF", "Extract a page range into a new PDF.", "PDF", "/files/pdf/split", ["pdf"], pdf, "split", ["pdf-merge"], ["startPage", "endPage"]),
  "pdf-merge": { ...single("Merge to PDF", "Combine PDFs, Word documents, Excel files, and supported images into one PDF in the selected order. You can also merge multiple PDFs.", "PDF", "/files/pdf/merge", ["pdf", "docx", "xlsx", ...imageExt], pdf, "merged", ["pdf-split", "zip"]), field: "files", multiple: true, minFiles: 2, limits: multi("merge") },
  "pdf-unlock": single("Unlock PDF", "Remove a PDF password when you know it.", "PDF", "/files/pdf/unlock", ["pdf"], pdf, "unlocked", ["pdf-compress"], ["password"]),
  "pdf-to-word": single("PDF to Word", "Convert PDF to DOCX.", "Convert", "/files/pdf/to-word", ["pdf"], pdf, "converted", ["word-to-pdf", "pdf-to-excel"]),
  "word-to-pdf": single("Word to PDF", "Convert DOCX to PDF.", "Convert", "/files/word/to-pdf", ["docx"], office, "converted", ["pdf-to-word", "word-to-excel"]),
  "pdf-to-excel": single("PDF to Excel", "Convert PDF tables to XLSX.", "Convert", "/files/pdf/to-excel", ["pdf"], pdf, "converted", ["excel-to-pdf", "pdf-to-word"]),
  "excel-to-pdf": single("Excel to PDF", "Convert XLSX to PDF.", "Convert", "/files/excel/to-pdf", ["xlsx"], office, "converted", ["pdf-to-excel", "excel-to-word"]),
  "pdf-to-pptx": single("PDF to PPTX", "Convert PDF pages to slides.", "Convert", "/files/pdf/to-pptx", ["pdf"], pdf, "converted", ["pptx-to-pdf"]),
  "pptx-to-pdf": single("PPTX to PDF", "Convert slides to PDF.", "Convert", "/files/pptx/to-pdf", ["pptx"], office, "converted", ["pdf-to-pptx"]),
  "word-to-excel": single("Word to Excel", "Convert DOCX tables to XLSX.", "Convert", "/files/word/to-excel", ["docx"], office, "converted", ["excel-to-word", "word-to-pdf"]),
  "excel-to-word": single("Excel to Word", "Convert XLSX sheets to DOCX.", "Convert", "/files/excel/to-word", ["xlsx"], office, "converted", ["word-to-excel", "excel-to-pdf"]),
  "ocr-to-word": { ...single("OCR to Word", "Extract text from an image or PDF into DOCX.", "Other", "/files/ocr/to-word", ["pdf", ...imageExt], Math.max(image, ocrPdf), null, ["pdf-to-word"], ["lang"]), localBinary: true,
    limits: { ...one(Math.max(image, ocrPdf)), bytesByExtension: { ...mixedLimits, pdf: ocrPdf }, maxPdfPages: count(process.env.NEXT_PUBLIC_FILE_LIMIT_OCR_PAGES, 100) } },
  "batch-convert": { ...single("Batch convert", "Convert several files to one target format and download a ZIP.", "Other", "/files/convert/batch", allExt, pdf, "zip", ["zip", "image-convert"], ["format"]), field: "files", multiple: true,
    targetFormat: { required: true, field: "format", choices: [...imageFormats, "pdf", "docx", "xlsx", "pptx"] }, limits: multi("batch") },
  zip: { ...single("Create ZIP", "Bundle files into one ZIP archive.", "Other", "/files/zip", allExt, pdf, "zip", ["batch-convert", "pdf-merge"]), field: "files", multiple: true, limits: multi("zip") },
};

export const toolIds = Object.keys(tools) as ToolId[];

export function getStorageMode(): StorageMode {
  const mode = process.env.NEXT_PUBLIC_FILE_STORAGE_MODE ?? "local";
  if (mode !== "local" && mode !== "r2") {
    throw new FileBoxError("config", "File processing is not configured.", "NEXT_PUBLIC_FILE_STORAGE_MODE must be local or r2.");
  }
  return mode;
}
