"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { tools } from "@/lib/filebox";
import { searchTools, toolPath } from "@/lib/filebox/discovery";
import { ToolIcon } from "./tool-icon";

export function ToolSearch({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = searchTools(query);

  function navigate(id: (typeof matches)[number]) {
    setOpen(false);
    onNavigate?.();
    router.push(toolPath(id));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (matches[0]) navigate(matches[0]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setOpen(false);
  }

  return <div className={`tool-search${compact ? " tool-search-compact" : ""}`}>
    <form role="search" onSubmit={submit}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
      <label className="sr-only" htmlFor={resultsId}>Find a file tool</label>
      <input id={resultsId} type="search" value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown} placeholder="What do you need to do with a file?"
        autoComplete="off" aria-controls={`${resultsId}-results`} aria-expanded={open} />
      {!compact && <span className="search-hint">Search tools ↵</span>}
    </form>
    {open && query.trim() && <div className="search-results" id={`${resultsId}-results`}>
      <p className="search-results-label">{matches.length ? "Tools" : "No matching tools"}</p>
      {matches.slice(0, 7).map(id => <button type="button" key={id} onMouseDown={event => event.preventDefault()}
        onClick={() => navigate(id)}>
        <ToolIcon id={id} /><span><strong>{tools[id].label}</strong><small>{tools[id].description}</small></span>
        <span className="result-arrow" aria-hidden="true">↗</span>
      </button>)}
    </div>}
  </div>;
}
