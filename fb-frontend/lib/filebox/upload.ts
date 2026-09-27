import { api, type CompressionResponse, type ObjectReference } from "./api";
import { tools, type ToolConfig, type ToolId } from "./config";
import { errorFromResponse, FileBoxError, normalizeError } from "./errors";

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", avif: "image/avif", tiff: "image/tiff",
  pdf: "application/pdf",
};

export function validateFiles(tool: ToolId, files: readonly File[]): void {
  const config: ToolConfig = tools[tool];
  if (files.length < 1 || files.length > config.limits.maxFiles) {
    throw new FileBoxError(400, `Select ${config.limits.maxFiles === 1 ? "one file" : `up to ${config.limits.maxFiles} files`}.`);
  }
  let total = 0;
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!config.acceptedExtensions.includes(ext) ||
      (file.type && file.type !== "application/octet-stream" &&
        !config.acceptedMimeTypes.includes(file.type))) {
      throw new FileBoxError(400, "This file type is not supported.");
    }
    if (file.size === 0) throw new FileBoxError(400, "Choose a file that is not empty.");
    if (file.size > config.limits.maxBytesPerFile) {
      throw new FileBoxError(413, "This file is too large. Choose a smaller file.");
    }
    total += file.size;
  }
  if (total > config.limits.maxTotalBytes) {
    throw new FileBoxError(413, "The selected files are too large together.");
  }
}

export function localFormData(tool: ToolId, files: readonly File[], fields: Record<string, string> = {}): FormData {
  validateFiles(tool, files);
  const config = tools[tool];
  const body = new FormData();
  files.forEach(file => body.append(config.field, file, file.name));
  Object.entries(fields).forEach(([key, value]) => body.append(key, value));
  return body;
}

export async function processLocalFiles(
  tool: ToolId, files: readonly File[], fields: Record<string, string> = {}, signal?: AbortSignal,
  onUploadComplete?: () => void,
): Promise<CompressionResponse> {
  return api.processLocal(tools[tool].endpoint, localFormData(tool, files, fields), signal, onUploadComplete);
}

export async function uploadToR2(file: File, signal?: AbortSignal): Promise<ObjectReference> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = mimeByExtension[ext];
  if (!type) throw new FileBoxError(400, "This file type is not supported.");
  const signed = await api.uploadUrl({ name: file.name, size: file.size, type }, signal);
  let response: Response;
  try {
    response = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: file,
      signal,
    });
  } catch (error) {
    throw normalizeError(error);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return signed.object;
}

export async function processR2Files(
  tool: ToolId, files: readonly File[], signal?: AbortSignal,
  onUploadComplete?: () => void,
): Promise<CompressionResponse> {
  validateFiles(tool, files);
  // Compression tools currently accept one signed input reference.
  const object = await uploadToR2(files[0], signal);
  onUploadComplete?.();
  return api.processR2(tools[tool].endpoint, object, signal);
}
