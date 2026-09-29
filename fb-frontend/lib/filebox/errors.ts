export type FrontendErrorCode = 400 | 401 | 413 | 429 | 503 | 500 | "network" | "config";

const messages: Record<Exclude<FrontendErrorCode, "network" | "config">, string> = {
  400: "Check the selected file and try again.",
  401: "The PDF password is incorrect. Try again.",
  413: "This file is too large. Choose a smaller file.",
  429: "Too many requests. Please wait a moment and try again.",
  503: "Processing is temporarily unavailable. Please try again later.",
  500: "Something went wrong while processing your file. Please try again.",
};

export class FileBoxError extends Error {
  constructor(
    public readonly code: FrontendErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "FileBoxError";
  }
}

export async function errorFromResponse(response: Response): Promise<FileBoxError> {
  const body: unknown = await response.json().catch(() => null);
  const detail = body && typeof body === "object" && "error" in body &&
    typeof body.error === "string" ? body.error : undefined;
  const code = response.status in messages
    ? response.status as keyof typeof messages
    : 500;
  return new FileBoxError(code, messages[code], detail);
}

export function normalizeError(error: unknown): FileBoxError {
  if (error instanceof FileBoxError) return error;
  return new FileBoxError("network", "Could not connect. Check your connection and try again.");
}
