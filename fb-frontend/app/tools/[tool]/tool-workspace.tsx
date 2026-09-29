"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  acceptForTool, availableFormats, downloadResult, idleState,
  normalizeError, runTool, tools, validateFiles, type OptionName,
  type ProcessingState, type ToolId,
} from "@/lib/filebox";

const size = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const labels: Record<OptionName, string> = {
  width: "Width (pixels)", height: "Height (pixels)", format: "Output format",
  password: "PDF password", startPage: "First page", endPage: "Last page",
  lang: "OCR language code",
};

export default function ToolWorkspace({ tool }: { tool: ToolId }) {
  const config = tools[tool];
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Record<string, string>>({ lang: "eng" });
  const [state, setState] = useState<ProcessingState>(idleState);
  const [downloadError, setDownloadError] = useState<string>();
  const controllerRef = useRef<AbortController | null>(null);
  const busy = state.status === "uploading" || state.status === "queued/processing";

  function addFiles(incoming: File[]) {
    if (!incoming.length || busy) return;
    const next = config.multiple ? [...files, ...incoming] : [incoming[0]];
    try {
      validateFiles(tool, next, false);
      setFiles(next);
      if (options.format && !availableFormats(tool, next).includes(options.format)) {
        setOptions(previous => ({ ...previous, format: "" }));
      }
      setState(idleState);
      setDownloadError(undefined);
    } catch (error) {
      setState({ status: "error", error: normalizeError(error) });
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  }

  function remove(index: number) {
    setFiles(previous => previous.filter((_, position) => position !== index));
    setState(idleState);
    setDownloadError(undefined);
  }

  function move(index: number, offset: number) {
    setFiles(previous => {
      const next = [...previous];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
    setState(idleState);
  }

  function setOption(name: OptionName, value: string) {
    setOptions(previous => ({ ...previous, [name]: value }));
    setState(idleState);
    setDownloadError(undefined);
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;
    setDownloadError(undefined);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await runTool(tool, files, options, next => {
        if (controllerRef.current === controller) setState(next);
      }, controller.signal);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function reset() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setFiles([]);
    setOptions({ lang: "eng" });
    setState(idleState);
    setDownloadError(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function download() {
    if (state.status !== "success") return;
    setDownloadError(undefined);
    try { await downloadResult(state.result); }
    catch (error) { setDownloadError(normalizeError(error).message); }
  }

  const formats = availableFormats(tool, files);

  return (
    <form onSubmit={submit} className="tool-form">
      <section aria-labelledby="files-heading">
        <h2 id="files-heading">Files</h2>
        <div className="drop-zone" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
          <p>Drag and drop {config.multiple ? "files" : "a file"} here, or choose from your device.</p>
          <input ref={inputRef} type="file" accept={acceptForTool(tool)} multiple={config.multiple}
            onChange={onPick} disabled={busy} aria-label="Choose files" />
        </div>
        <p className="hint">Accepted: {config.acceptedExtensions.map(ext => `.${ext}`).join(", ")}.
          {` ${config.minFiles === config.limits.maxFiles ? config.minFiles : `${config.minFiles}–${config.limits.maxFiles}`} file(s), up to ${size(config.limits.maxTotalBytes)} total.`}
          {config.limits.maxPdfPages ? ` PDF OCR is limited to ${config.limits.maxPdfPages} pages.` : ""}
        </p>
        {files.length > 0 && (
          <ol className="selected-files">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`}>
                <span>{file.name} <small>({size(file.size)})</small></span>
                <span className="file-actions">
                  {config.multiple && <>
                    <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move ${file.name} up`}>Up</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={busy || index === files.length - 1} aria-label={`Move ${file.name} down`}>Down</button>
                  </>}
                  <button type="button" onClick={() => remove(index)} disabled={busy} aria-label={`Remove ${file.name}`}>Remove</button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {config.options.length > 0 && (
        <section aria-labelledby="options-heading">
          <h2 id="options-heading">Options</h2>
          <div className="option-grid">
            {config.options.map(name => (
              <label key={name}>
                <span>{labels[name]}</span>
                {name === "format" ? (
                  <select value={options.format ?? ""} onChange={event => setOption("format", event.target.value)}
                    disabled={busy} required>
                    <option value="">Select format</option>
                    {formats.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
                  </select>
                ) : (
                  <input type={name === "password" ? "password" : ["width", "height", "startPage", "endPage"].includes(name) ? "number" : "text"}
                    min={["width", "height", "startPage", "endPage"].includes(name) ? 1 : undefined}
                    value={options[name] ?? ""} onChange={event => setOption(name, event.target.value)}
                    disabled={busy} required={name === "startPage" || name === "endPage"} />
                )}
              </label>
            ))}
          </div>
          {tool === "batch-convert" && files.length > 0 && formats.length === 0 &&
            <p role="alert">The selected file types have no shared output format. Remove a file or use separate conversions.</p>}
        </section>
      )}

      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? "Working…" : "Process files"}</button>
        {state.status === "error" && <button type="button" onClick={() => void submit()}>Retry</button>}
        <button type="button" onClick={reset}>Reset</button>
      </div>

      <div aria-live="polite" className="status">
        {state.status === "uploading" && <p>Uploading files…</p>}
        {state.status === "queued/processing" && <p>Queued or processing. Please keep this page open…</p>}
        {state.status === "error" && <p role="alert">{state.error.message}{state.error.detail ? ` ${state.error.detail}` : ""}</p>}
        {state.status === "success" && <div>
          <p>{state.result.message}</p>
          <p>Ready: {state.result.filename}</p>
          <button type="button" onClick={() => void download()}>Download {state.result.filename}</button>
        </div>}
        {downloadError && <p role="alert">{downloadError}</p>}
      </div>
    </form>
  );
}
