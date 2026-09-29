"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tools } from "@/lib/filebox";
import { navGroups, toolPath } from "@/lib/filebox/discovery";
import { ToolIcon } from "./tool-icon";
import { ToolSearch } from "./tool-search";

export function SiteHeader() {
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function close(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") { setMegaOpen(false); setMobileOpen(false); }
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (window.matchMedia("(max-width: 800px)").matches) setMobileOpen(true);
        else setMegaOpen(true);
      }
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [megaOpen, mobileOpen]);

  useEffect(() => {
    if (megaOpen) document.querySelector<HTMLInputElement>("#mega-search input")?.focus();
  }, [megaOpen]);

  useEffect(() => {
    if (!megaOpen) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Element && !event.target.closest(".site-header")) setMegaOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [megaOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return <header className="site-header">
    <div className="site-header-inner container">
      <Link href="/" className="brand" onClick={() => { setMegaOpen(false); setMobileOpen(false); }} aria-label="FileBox home">
        <span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>FileBox</span>
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <button type="button" className={megaOpen ? "nav-active" : ""} aria-expanded={megaOpen} aria-controls="tools-mega-menu"
          onClick={() => setMegaOpen(value => !value)}>Tools <span aria-hidden="true">⌄</span></button>
        <Link href="/#features" onClick={() => setMegaOpen(false)}>Features</Link>
        <Link href="/#about" onClick={() => setMegaOpen(false)}>About</Link>
      </nav>
      <button className="header-search-trigger desktop-search" type="button" aria-label="Search tools"
        onClick={() => setMegaOpen(true)}>
        <span aria-hidden="true">⌕</span> Search <kbd>⌘ K</kbd>
      </button>
      <div className="mobile-actions">
        <button type="button" aria-label="Search tools" onClick={() => setMobileOpen(true)}>⌕</button>
        <button type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? "×" : "☰"}</button>
      </div>
    </div>
    {megaOpen && <div className="mega-menu" id="tools-mega-menu">
      <div className="container mega-inner">
        <div className="mega-top"><div><span className="eyebrow">Find your next tool</span><h2>What are you working on?</h2></div>
          <button type="button" className="close-button" onClick={() => setMegaOpen(false)} aria-label="Close tools menu">×</button></div>
        <div id="mega-search"><ToolSearch compact onNavigate={() => setMegaOpen(false)} /></div>
        <div className="mega-groups">{navGroups.map(group => <section key={group.name}>
          <h3>{group.name}</h3><ul>{group.ids.map(id => <li key={id}><Link href={toolPath(id)} onClick={() => setMegaOpen(false)}>
            <ToolIcon id={id} /><span>{tools[id].label}</span></Link></li>)}</ul>
        </section>)}</div>
      </div>
    </div>}
    {mobileOpen && <div className="mobile-sheet">
      <div className="mobile-sheet-inner">
        <ToolSearch compact onNavigate={() => setMobileOpen(false)} />
        <nav aria-label="Mobile navigation">
          {navGroups.map(group => <details key={group.name}><summary>{group.name}<span aria-hidden="true">+</span></summary>
            <ul>{group.ids.map(id => <li key={id}><Link href={toolPath(id)} onClick={() => setMobileOpen(false)}>
              <ToolIcon id={id} />{tools[id].label}</Link></li>)}</ul>
          </details>)}
          <Link href="/#features" onClick={() => setMobileOpen(false)}>Features</Link>
          <Link href="/#about" onClick={() => setMobileOpen(false)}>About</Link>
        </nav>
      </div>
    </div>}
  </header>;
}
