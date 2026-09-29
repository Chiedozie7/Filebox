import type { BinaryResponse, ObjectReference, ProcessResponse } from "./api";
import { getStorageMode, tools, type ToolId } from "./config";
import { FileBoxError, normalizeError } from "./errors";
import { fileExtension, processLocalFiles, processR2Files, validateFiles } from "./upload";

export interface ToolResult {
  filename: string;
  message: string;
  blob?: Blob;
  output?: ObjectReference;
  downloadUrl?: string;
  metadata?: ProcessResponse;
}

export type ProcessingState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "queued/processing" }
  | { status: "success"; result: ToolResult }
  | { status: "error"; error: FileBoxError };

export const idleState: ProcessingState = { status: "idle" };

const imageFormats = new Set(["jpg", "jpeg", "png", "webp", "avif", "tiff"]);
const batchTargets: Record<string, readonly string[]> = {
  pdf: ["docx", "xlsx", "pptx"],
  pptx: ["pdf"],
  docx: ["pdf", "xlsx"],
  xlsx: ["pdf", "docx"],
};

export function availableFormats(tool: ToolId, files: readonly File[]): readonly string[] {
  const choices = tools[tool].targetFormat.choices;
  if (tool !== "batch-convert" || files.length === 0) return choices;
  return choices.filter(target => files.every(file => {
    const source = fileExtension(file);
    return imageFormats.has(source) ? imageFormats.has(target) : batchTargets[source]?.includes(target);
  }));
}

export function validateOptions(tool: ToolId, files: readonly File[], options: Record<string, string>): Record<string, string> {
  const config = tools[tool];
  const fields: Record<string, string> = {};
  for (const name of config.options) {
    if (options[name] !== undefined) fields[name] = name === "password" ? options[name] : options[name].trim();
  }
  if (config.targetFormat.required && !availableFormats(tool, files).includes(fields.format)) {
    throw new FileBoxError(400, "Choose a supported output format for the selected files.");
  }
  const positive = (value: string | undefined) => value !== undefined &&
    /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  if (tool === "image-resize" && !positive(fields.width) && !positive(fields.height)) {
    throw new FileBoxError(400, "Enter a positive width or height.");
  }
  if (tool === "image-resize" &&
    (fields.width && !positive(fields.width) || fields.height && !positive(fields.height))) {
    throw new FileBoxError(400, "Width and height must be positive whole numbers.");
  }
  if (tool === "pdf-split" && (!positive(fields.startPage) || !positive(fields.endPage) ||
    Number(fields.endPage) < Number(fields.startPage))) {
    throw new FileBoxError(400, "Enter a valid first and last page in ascending order.");
  }
  if (tool === "ocr-to-word") fields.lang = fields.lang || "eng";
  return fields;
}

const isBinaryResponse = (response: ProcessResponse | BinaryResponse): response is BinaryResponse =>
  "blob" in response && response.blob instanceof Blob && typeof response.filename === "string";

function toResult(tool: ToolId, response: ProcessResponse | BinaryResponse): ToolResult {
  if (isBinaryResponse(response)) {
    return { filename: response.filename, blob: response.blob, message: "OCR conversion completed." };
  }
  const config = tools[tool];
  const filename = response.output?.name ?? (config.outputField ? response[config.outputField] : undefined);
  if (typeof filename !== "string" || !filename) {
    throw new FileBoxError(500, "Processing finished, but no download was returned.");
  }
  return { filename, message: response.message ?? "Processing completed.",
    output: response.output, downloadUrl: response.downloadUrl, metadata: response };
}

export async function runTool(
  tool: ToolId, files: readonly File[], options: Record<string, string>,
  onStateChange: (state: ProcessingState) => void, signal?: AbortSignal,
): Promise<ToolResult | undefined> {
  try {
    validateFiles(tool, files);
    const fields = validateOptions(tool, files, options);
    const mode = getStorageMode();
    onStateChange({ status: "uploading" });
    const uploaded = () => onStateChange({ status: "queued/processing" });
    const response = mode === "r2"
      ? await processR2Files(tool, files, fields, signal, uploaded)
      : await processLocalFiles(tool, files, fields, signal, uploaded);
    const result = toResult(tool, response);
    onStateChange({ status: "success", result });
    return result;
  } catch (error) {
    onStateChange({ status: "error", error: normalizeError(error) });
    return undefined;
  }
}

export const runCompression = (tool: "image-compress" | "pdf-compress", file: File,
  onStateChange: (state: ProcessingState) => void, signal?: AbortSignal) =>
  runTool(tool, [file], {}, onStateChange, signal);
