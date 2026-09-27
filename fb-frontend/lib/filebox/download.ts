import { api, type CompressionResponse } from "./api";
import { errorFromResponse, normalizeError } from "./errors";

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

export async function downloadResult(result: CompressionResponse, signal?: AbortSignal): Promise<void> {
  if (result.output) {
    const url = result.downloadUrl ?? (await api.downloadUrl(result.output, signal)).url;
    return downloadBlob(url, result.output.name, signal);
  }
  return downloadBlob(api.localDownloadUrl(result.compressed), result.compressed, signal);
}
