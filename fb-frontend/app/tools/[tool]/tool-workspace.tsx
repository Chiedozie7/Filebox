"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  availableFormats, downloadResult, idleState,
  normalizeError, runTool, tools, validateFiles, type OptionName,
  type ProcessingState, type ToolId,
} from "@/lib/filebox";
import { Dropzone, ProcessingResult, SelectedFileList, ToolOptions } from "@/components/tool-workspace-parts";

export default function ToolWorkspace({ tool }: { tool: ToolId }) {
  const config = tools[tool];
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Record<string, string>>({ lang: "eng" });
  const [state, setState] = useState<ProcessingState>(idleState);
  const [downloadError, setDownloadError] = useState<string>();
  const [stillWorking, setStillWorking] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const busy = ["preparing", "uploading", "processing", "finalizing"].includes(state.status);

  useEffect(() => {
    if (state.status !== "processing") return;
    const timer = window.setTimeout(() => setStillWorking(true), 8000);
    return () => window.clearTimeout(timer);
  }, [state.status]);

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

  function onPickerKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (busy || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    inputRef.current?.click();
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
        if (controllerRef.current === controller) {
          setStillWorking(false);
          setState(next);
        }
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
      <section className="form-panel" aria-labelledby="files-heading"><div className="form-panel-heading"><span className="step-number">01</span>
        <div><h2 id="files-heading">Add your {config.multiple ? "files" : "file"}</h2><p>Select what you want to process.</p></div></div>
        <Dropzone tool={tool} busy={busy} inputRef={inputRef} onPick={onPick} onDrop={onDrop} onKeyDown={onPickerKeyDown} />
        <SelectedFileList files={files} multiple={config.multiple} busy={busy} remove={remove} move={move} />
      </section>
      <ToolOptions tool={tool} files={files} formats={formats} options={options} busy={busy} setOption={setOption} />
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Working…" : "Process files"} <span aria-hidden="true">→</span></button>
        {state.status === "error" && <button type="button" className="secondary-button" onClick={() => void submit()}>Retry</button>}
        <button type="button" className="ghost-button" onClick={reset}>Reset</button>
      </div>
      <ProcessingResult state={state} stillWorking={stillWorking} downloadError={downloadError} download={() => void download()} />
    </form>
  );
}
