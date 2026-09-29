import { api } from "./api";
import { errorFromResponse, normalizeError } from "./errors";
import type { ToolResult } from "./processing";

export async function downloadBlob(url: string, filename: string, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    throw normalizeError(error);
  }
  if (!response.ok) throw await errorFromResponse(response);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

export async function downloadResult(result: ToolResult, signal?: AbortSignal): Promise<void> {
  if (result.blob) {
    const objectUrl = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = result.filename;
    document.body.append(anchor);
    try { anchor.click(); }
    finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000); }
    return;
  }
  if (result.output) {
    const url = result.downloadUrl ?? (await api.downloadUrl(result.output, signal)).url;
    try { return await downloadBlob(url, result.filename, signal); }
    catch {
      const refreshed = await api.downloadUrl(result.output, signal);
      return downloadBlob(refreshed.url, result.filename, signal);
    }
  }
  return downloadBlob(api.localDownloadUrl(result.filename), result.filename, signal);
}
