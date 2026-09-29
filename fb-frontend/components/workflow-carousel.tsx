"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { workflows } from "@/lib/filebox/discovery";
import { FileVisual } from "./discovery-ui";

export function WorkflowCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  function go(index: number) {
    const next = (index + workflows.length) % workflows.length;
    setActive(next);
    track.current?.children[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
  return <div className="workflow-carousel">
    <div className="carousel-top"><span>{String(active + 1).padStart(2, "0")} / {String(workflows.length).padStart(2, "0")}</span>
      <div><button type="button" onClick={() => go(active - 1)} aria-label="Previous workflow">←</button>
        <button type="button" onClick={() => go(active + 1)} aria-label="Next workflow">→</button></div></div>
    <div className="workflow-track" ref={track} onScroll={() => {
      if (!track.current) return;
      const nodes = Array.from(track.current.children) as HTMLElement[];
      const center = track.current.getBoundingClientRect().left + track.current.clientWidth / 2;
      const distance = (node: HTMLElement) => Math.abs(node.getBoundingClientRect().left + node.clientWidth / 2 - center);
      const next = nodes.reduce((closest, node, index) => distance(node) < distance(nodes[closest]) ? index : closest, 0);
      setActive(next);
    }}>
      {workflows.map((workflow, index) => <article className={`workflow-slide${active === index ? " is-active" : ""}`} key={workflow.id}>
        <div className="workflow-slide-visual"><FileVisual kind={workflow.visual} /></div>
        <div className="workflow-slide-copy"><span className="eyebrow">Workflow 0{index + 1}</span><h3>{workflow.title}</h3>
          <p>{workflow.description}</p><Link className="text-link" href={workflow.href}>Explore workflow <span aria-hidden="true">↗</span></Link></div>
      </article>)}
    </div>
  </div>;
}
