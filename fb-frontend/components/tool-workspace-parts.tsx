"use client";

import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import { acceptForTool, tools, type OptionName, type ProcessingState, type ToolId } from "@/lib/filebox";

export const fileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` :
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function Dropzone({ tool, busy, inputRef, onPick, onDrop, onKeyDown }: {
  tool: ToolId; busy: boolean; inputRef: RefObject<HTMLInputElement | null>;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLabelElement>) => void;
}) {
  const config = tools[tool];
  const accepted = config.acceptedExtensions.map(ext => `.${ext}`).join(", ");
  const count = config.minFiles === config.limits.maxFiles ? String(config.minFiles) :
    `${config.minFiles}–${config.limits.maxFiles}`;
  const perFileLimits = config.limits.bytesByExtension ? config.acceptedExtensions.reduce<Record<number, string[]>>((groups, ext) => {
    const limit = config.limits.bytesByExtension?.[ext] ?? config.limits.maxBytesPerFile;
    (groups[limit] ??= []).push(`.${ext}`);
    return groups;
  }, {}) : null;
  return <div className="upload-area">
    <label className="drop-zone" role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy}
      onKeyDown={onKeyDown} onDragOver={event => event.preventDefault()} onDrop={onDrop}>
      <span className="upload-glyph" aria-hidden="true">↑</span>
      <strong>Drop {config.multiple ? "files" : "a file"} here</strong>
      <span className="drop-subcopy">or select from your device</span>
      <span className="choose-button">Choose {config.multiple ? "files" : "file"}</span>
      <input ref={inputRef} className="visually-hidden" type="file" accept={acceptForTool(tool)} multiple={config.multiple}
        onChange={onPick} disabled={busy} aria-label="Choose files" />
    </label>
    <div className="file-limits"><span>Accepted <strong>{accepted}</strong></span>
      <span>Files <strong>{count}</strong></span><span>Total limit <strong>{fileSize(config.limits.maxTotalBytes)}</strong></span>
      {!perFileLimits && <span>Per file <strong>{fileSize(config.limits.maxBytesPerFile)}</strong></span>}
      {config.limits.maxPdfPages && <span>PDF OCR <strong>{config.limits.maxPdfPages} pages</strong></span>}
    </div>
    {perFileLimits && <details className="per-file-limits"><summary>Per-file limits by format</summary>
      <p>{Object.entries(perFileLimits).map(([bytes, extensions]) => `${extensions.join(", ")} ${fileSize(Number(bytes))}`).join(" · ")}</p>
    </details>}
  </div>;
}

export function SelectedFileList({ files, multiple, busy, remove, move }: {
  files: readonly File[]; multiple: boolean; busy: boolean;
  remove: (index: number) => void; move: (index: number, offset: number) => void;
}) {
  if (!files.length) return null;
  return <div className="selected-wrap"><div className="selected-header"><h3>Selected files</h3><span>{files.length} selected</span></div>
    <ol className="selected-files">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}>
      <span className="selected-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="selected-name">{file.name} <small>{fileSize(file.size)}</small></span>
      <span className="file-actions">{multiple && <>
        <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move ${file.name} up`}>↑</button>
        <button type="button" onClick={() => move(index, 1)} disabled={busy || index === files.length - 1} aria-label={`Move ${file.name} down`}>↓</button>
      </>}
        <button type="button" onClick={() => remove(index)} disabled={busy} aria-label={`Remove ${file.name}`}>×</button>
      </span>
    </li>)}</ol>
  </div>;
}

const labels: Record<OptionName, string> = {
  width: "Width (pixels)", height: "Height (pixels)", format: "Output format",
  password: "PDF password", startPage: "First page", endPage: "Last page", lang: "OCR language code",
};

export function ToolOptions({ tool, files, formats, options, busy, setOption }: {
  tool: ToolId; files: readonly File[]; formats: readonly string[]; options: Record<string, string>; busy: boolean;
  setOption: (name: OptionName, value: string) => void;
}) {
  const config = tools[tool];
  if (!config.options.length) return null;
  return <details className="options-panel" open>
    <summary><span><span className="step-number">02</span> Options</span><span className="options-chevron" aria-hidden="true">⌄</span></summary>
    <div className="option-grid">{config.options.map(name => <label key={name}><span>{labels[name]}</span>
      {name === "format" ? <select value={options.format ?? ""} onChange={event => setOption("format", event.target.value)} disabled={busy} required>
        <option value="">Select format</option>{formats.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
      </select> : <input type={name === "password" ? "password" : ["width", "height", "startPage", "endPage"].includes(name) ? "number" : "text"}
        min={["width", "height", "startPage", "endPage"].includes(name) ? 1 : undefined}
        value={options[name] ?? ""} onChange={event => setOption(name, event.target.value)}
        disabled={busy} required={name === "startPage" || name === "endPage"} />}
    </label>)}</div>
    {tool === "batch-convert" && files.length > 0 && formats.length === 0 &&
      <p role="alert">The selected file types have no shared output format. Remove a file or use separate conversions.</p>}
  </details>;
}

export function ProcessingResult({ state, stillWorking, downloadError, download }: {
  state: ProcessingState; stillWorking: boolean; downloadError?: string; download: () => void;
}) {
  const phase = state.status === "preparing" ? "Preparing your files…" :
    state.status === "uploading" ? "Uploading files…" :
    state.status === "processing" ? "Processing your files…" :
    state.status === "finalizing" ? "Finalizing your result…" : null;
  return <div aria-live="polite" className="status">
    {phase && <div className="processing-card"><span className="status-spinner" aria-hidden="true"/><div><strong>{phase}</strong>
      {stillWorking && state.status === "processing" && <p>Still working — larger files can take a little longer.</p>}</div></div>}
    {state.status === "error" && <div className="result-card error-card" role="alert"><span className="result-symbol" aria-hidden="true">!</span>
      <div><strong>Something needs attention</strong><p>{state.error.message}{state.error.detail ? ` ${state.error.detail}` : ""}</p></div></div>}
    {state.status === "success" && <div className="result-card success-card"><span className="result-symbol" aria-hidden="true">✓</span>
      <div className="result-content"><strong>{state.result.message}</strong><p className="result-filename">{state.result.filename}</p>
        {state.result.compression && <div className="compression-result"><p>Original size: {fileSize(state.result.compression.originalBytes)}</p>
          {state.result.compression.outputBytes !== undefined && <p>Output size: {fileSize(state.result.compression.outputBytes)}</p>}
          {state.result.compression.retainedOriginal ? <p>No size reduction. The original file was retained.</p> :
            state.result.compression.savedPercent !== undefined ? <p>Saved: {state.result.compression.savedPercent}%</p> :
              state.result.compression.outputBytes !== undefined && <p>No size reduction.</p>}
        </div>}
        <button type="button" className="primary-button download-button" onClick={download}>Download {state.result.filename} <span aria-hidden="true">↓</span></button>
      </div></div>}
    {downloadError && <p role="alert" className="download-error">{downloadError}</p>}
  </div>;
}
