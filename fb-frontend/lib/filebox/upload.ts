import { api, type BinaryResponse, type ObjectReference, type ProcessResponse } from "./api";
import { tools, type ToolConfig, type ToolId } from "./config";
import { errorFromResponse, FileBoxError, normalizeError } from "./errors";

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", avif: "image/avif", tiff: "image/tiff",
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const fileExtension = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";
export const acceptForTool = (tool: ToolId) => tools[tool].acceptedExtensions.map(ext => `.${ext}`).join(",");

export function validateFiles(tool: ToolId, files: readonly File[], requireMinimum = true): void {
  const config: ToolConfig = tools[tool];
  if ((requireMinimum && files.length < config.minFiles) || files.length > config.limits.maxFiles) {
    throw new FileBoxError(400, config.minFiles === config.limits.maxFiles
      ? `Select ${config.minFiles} file${config.minFiles === 1 ? "" : "s"}.`
      : `Select ${config.minFiles} to ${config.limits.maxFiles} files.`);
  }
  let total = 0;
  for (const file of files) {
    const ext = fileExtension(file);
    if (!config.acceptedExtensions.includes(ext) ||
      (file.type && file.type !== "application/octet-stream" &&
        file.type !== mimeByExtension[ext] && !(ext === "avif" && file.type === "image/heif"))) {
      throw new FileBoxError(400, "This file type is not supported.");
    }
    if (file.size === 0) throw new FileBoxError(400, "Choose a file that is not empty.");
    if (file.size > (config.limits.bytesByExtension?.[ext] ?? config.limits.maxBytesPerFile)) {
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
): Promise<ProcessResponse | BinaryResponse> {
  return api.processLocal(tools[tool].endpoint, localFormData(tool, files, fields), signal,
    onUploadComplete, tools[tool].localBinary);
}

export async function uploadToR2(file: File, signal?: AbortSignal): Promise<ObjectReference> {
  const ext = fileExtension(file);
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
  tool: ToolId, files: readonly File[], fields: Record<string, string> = {}, signal?: AbortSignal,
  onUploadComplete?: () => void,
): Promise<ProcessResponse> {
  validateFiles(tool, files);
  const objects: ObjectReference[] = [];
  for (const file of files) objects.push(await uploadToR2(file, signal));
  onUploadComplete?.();
  const config = tools[tool];
  return api.processR2(config.endpoint, config.field, objects, fields, signal);
}
