import { errorFromResponse, FileBoxError, normalizeError } from "./errors";

export interface ObjectReference {
  token: string;
  key: string;
  name: string;
  size: number;
  type: string;
  expiresAt: number;
}

export interface UploadUrlResponse {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  object: ObjectReference;
}

export interface CompressionResponse {
  message: string;
  original: string;
  compressed: string;
  output?: ObjectReference;
  downloadUrl?: string;
  [metadata: string]: unknown;
}

export interface DownloadUrlResponse {
  url: string;
  expiresIn: number;
}

export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_FILEBOX_API_URL;
  if (!base) {
    throw new FileBoxError("config", "File processing is not configured.",
      "Set NEXT_PUBLIC_FILEBOX_API_URL to the backend origin.");
  }
  return `${base.replace(/\/+$/, "")}${path}`;
}

export async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), init);
  } catch (error) {
    throw normalizeError(error);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return response.json() as Promise<T>;
}

export const api = {
  uploadUrl: (file: { name: string; size: number; type: string }, signal?: AbortSignal) =>
    request<UploadUrlResponse>("/files/r2/upload-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(file), signal,
    }),
  downloadUrl: (object: ObjectReference, signal?: AbortSignal) =>
    request<DownloadUrlResponse>("/files/r2/download-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object }), signal,
    }),
  processLocal: (
    endpoint: string, body: FormData, signal?: AbortSignal,
    onUploadComplete?: () => void,
  ) => new Promise<CompressionResponse>((resolve, reject) => {
    let xhr: XMLHttpRequest;
    try {
      xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl(endpoint));
    } catch (error) {
      reject(normalizeError(error));
      return;
    }
    xhr.upload.onload = () => onUploadComplete?.();
    xhr.onerror = () => reject(normalizeError(null));
    xhr.onabort = () => reject(normalizeError(null));
    xhr.onload = async () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(await errorFromResponse(new Response(xhr.responseText, { status: xhr.status })));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as CompressionResponse);
      } catch {
        reject(new FileBoxError(500, "The server returned an invalid response."));
      }
    };
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    if (signal?.aborted) reject(normalizeError(null));
    else xhr.send(body);
  }),
  processR2: (endpoint: string, object: ObjectReference, signal?: AbortSignal) =>
    request<CompressionResponse>(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: object }), signal,
    }),
  localDownloadUrl: (filename: string) =>
    apiUrl(`/files/download/${encodeURIComponent(filename)}`),
};
