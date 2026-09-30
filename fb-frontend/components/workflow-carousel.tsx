"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { workflows } from "@/lib/filebox/discovery";
import { FileVisual } from "./discovery-ui";

export function WorkflowCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const viewport = track.current;
    if (!viewport) return;

    let frame = 0;
    function syncActive() {
      frame = 0;
      const viewportCenter = viewport!.getBoundingClientRect().left + viewport!.clientWidth / 2;
      let next = 0;
      let nearest = Infinity;
      Array.from(viewport!.children).forEach((slide, index) => {
        const bounds = slide.getBoundingClientRect();
        const distance = Math.abs(bounds.left + bounds.width / 2 - viewportCenter);
        if (distance < nearest) {
          nearest = distance;
          next = index;
        }
      });
      if (next !== activeIndexRef.current) {
        activeIndexRef.current = next;
        setActiveIndex(next);
      }
    }
    function scheduleSync() {
      if (frame) return;
      frame = requestAnimationFrame(syncActive);
    }
    viewport.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    if (window.matchMedia("(min-width: 1051px)").matches) {
      const second = viewport.children[1];
      if (second) {
        const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
        const bounds = second.getBoundingClientRect();
        viewport.scrollLeft += bounds.left + bounds.width / 2 - viewportCenter;
        activeIndexRef.current = 1;
        setActiveIndex(1);
      }
    } else {
      scheduleSync();
    }
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
    };
  }, []);

  function go(direction: number) {
    const viewport = track.current;
    if (!viewport) return;
    const next = (activeIndexRef.current + direction + workflows.length) % workflows.length;
    const slide = viewport.children[next];
    if (!slide) return;
    const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    const bounds = slide.getBoundingClientRect();
    const left = viewport.scrollLeft + bounds.left + bounds.width / 2 - viewportCenter;
    viewport.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return <div className="workflow-carousel">
    <div className="carousel-top"><span>{String(activeIndex + 1).padStart(2, "0")} / {String(workflows.length).padStart(2, "0")}</span>
      <div><button type="button" onClick={() => go(-1)} aria-label="Previous workflow">←</button>
        <button type="button" onClick={() => go(1)} aria-label="Next workflow">→</button></div></div>
    <div className="workflow-track" ref={track}>
      {workflows.map((workflow, index) => <article className={`workflow-slide${activeIndex === index ? " is-active" : ""}`} key={workflow.id}>
        <div className="workflow-slide-visual"><FileVisual kind={workflow.visual} /></div>
        <div className="workflow-slide-copy"><span className="eyebrow">Workflow 0{index + 1}</span><h3>{workflow.title}</h3>
          <p>{workflow.description}</p><Link className="text-link" href={workflow.href}>Explore workflow <span aria-hidden="true">↗</span></Link></div>
      </article>)}
    </div>
  </div>;
}
