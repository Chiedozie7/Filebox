import { FileBoxError } from "./errors";

export type ToolId = "image-compress" | "pdf-compress";
export type StorageMode = "local" | "r2";

export interface ToolConfig {
  endpoint: string;
  field: "file" | "files";
  acceptedExtensions: readonly string[];
  acceptedMimeTypes: readonly string[];
  multiple: boolean;
  targetFormat: { required: boolean; field: string | null };
  limits: { maxFiles: number; maxBytesPerFile: number; maxTotalBytes: number };
}

const mb = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed * 1024 * 1024)
    : fallback * 1024 * 1024;
};

const imageLimit = mb(process.env.NEXT_PUBLIC_FILE_LIMIT_IMAGE_MB, 10);
const pdfLimit = mb(process.env.NEXT_PUBLIC_FILE_LIMIT_PDF_MB, 50);

// Defaults mirror the backend's fileLimits.js. Set matching public values if its limits change.
export const tools = {
  "image-compress": {
    endpoint: "/files/compress",
    field: "file",
    acceptedExtensions: ["jpg", "jpeg", "png", "webp", "avif", "tiff"],
    acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heif", "image/tiff"],
    multiple: false,
    targetFormat: { required: false, field: null },
    limits: { maxFiles: 1, maxBytesPerFile: imageLimit, maxTotalBytes: imageLimit },
  },
  "pdf-compress": {
    endpoint: "/files/pdf/compress",
    field: "file",
    acceptedExtensions: ["pdf"],
    acceptedMimeTypes: ["application/pdf"],
    multiple: false,
    targetFormat: { required: false, field: null },
    limits: { maxFiles: 1, maxBytesPerFile: pdfLimit, maxTotalBytes: pdfLimit },
  },
} as const satisfies Record<ToolId, ToolConfig>;

export function getStorageMode(): StorageMode {
  const mode = process.env.NEXT_PUBLIC_FILE_STORAGE_MODE ?? "local";
  if (mode !== "local" && mode !== "r2") {
    throw new FileBoxError("config", "File processing is not configured.",
      "NEXT_PUBLIC_FILE_STORAGE_MODE must be local or r2.");
  }
  return mode;
}
