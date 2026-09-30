"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { tools } from "@/lib/filebox";
import { navGroups, toolPath } from "@/lib/filebox/discovery";
import { ToolIcon } from "./tool-icon";
import { ToolSearch } from "./tool-search";

function usePanelPresence(open: boolean) {
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    const timeout = window.setTimeout(() => setRendered(false), delay);
    return () => window.clearTimeout(timeout);
  }, [open]);

  return { rendered, visible };
}

export function SiteHeader() {
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const megaPanel = usePanelPresence(megaOpen);
  const mobilePanel = usePanelPresence(mobileOpen);

  function closeMobile() {
    setMobileOpen(false);
    setExpandedGroups([]);
  }

  useEffect(() => {
    function close(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") { setMegaOpen(false); closeMobile(); }
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
      <Link href="/" className="brand" onClick={() => { setMegaOpen(false); closeMobile(); }} aria-label="FileBox home">
        <span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>FileBox</span>
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <button type="button" className={megaOpen ? "nav-active" : ""} aria-expanded={megaOpen} aria-controls="tools-mega-menu"
          onClick={() => setMegaOpen(value => !value)}>Tools <svg className="nav-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 6 4.5 4.5L12.5 6" /></svg></button>
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
    {megaPanel.rendered && <div className={`mega-menu${megaPanel.visible ? " is-open" : ""}`} id="tools-mega-menu"
      inert={!megaOpen} aria-hidden={!megaOpen}>
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
    {mobilePanel.rendered && <div className={`mobile-sheet${mobilePanel.visible ? " is-open" : ""}`}
      inert={!mobileOpen} aria-hidden={!mobileOpen}>
      <div className="mobile-sheet-inner">
        <ToolSearch compact onNavigate={closeMobile} />
        <nav aria-label="Mobile navigation">
          {navGroups.map(group => {
            const expanded = expandedGroups.includes(group.name);
            const groupId = `mobile-group-${group.name.toLowerCase()}`;
            return <div className="mobile-group" key={group.name}>
              <button type="button" aria-expanded={expanded} aria-controls={groupId}
                onClick={() => setExpandedGroups(current => expanded ? current.filter(name => name !== group.name) : [...current, group.name])}>
                {group.name}<span aria-hidden="true">+</span>
              </button>
              <div className={`mobile-group-content${expanded ? " is-open" : ""}`} id={groupId}
                inert={!expanded} aria-hidden={!expanded}><div><ul>{group.ids.map(id =>
                  <li key={id}><Link href={toolPath(id)} onClick={closeMobile}>
                    <ToolIcon id={id} />{tools[id].label}</Link></li>)}</ul></div></div>
            </div>;
          })}
          <Link href="/#features" onClick={closeMobile}>Features</Link>
          <Link href="/#about" onClick={closeMobile}>About</Link>
        </nav>
      </div>
    </div>}
  </header>;
}
