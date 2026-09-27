import type { CompressionResponse } from "./api";
import { getStorageMode, type ToolId } from "./config";
import { FileBoxError, normalizeError } from "./errors";
import { processLocalFiles, processR2Files, validateFiles } from "./upload";

export type ProcessingState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "queued/processing" }
  | { status: "success"; result: CompressionResponse }
  | { status: "error"; error: FileBoxError };

export const idleState: ProcessingState = { status: "idle" };

export async function runCompression(
  tool: ToolId,
  file: File,
  onStateChange: (state: ProcessingState) => void,
  signal?: AbortSignal,
): Promise<CompressionResponse | undefined> {
  try {
    validateFiles(tool, [file]);
    const mode = getStorageMode();
    onStateChange({ status: "uploading" });
    const uploaded = () => onStateChange({ status: "queued/processing" });
    const result: CompressionResponse = mode === "r2"
      ? await processR2Files(tool, [file], signal, uploaded)
      : await processLocalFiles(tool, [file], {}, signal, uploaded);
    onStateChange({ status: "success", result });
    return result;
  } catch (error) {
    onStateChange({ status: "error", error: normalizeError(error) });
    return undefined;
  }
}
