import Link from "next/link";
import { tools, type ToolId } from "@/lib/filebox";
import { toolPath } from "@/lib/filebox/discovery";
import { ToolIcon, toolTone } from "./tool-icon";

export function SectionHeading({ eyebrow, title, description, href, linkText }: {
  eyebrow: string; title: string; description: string; href?: string; linkText?: string;
}) {
  return <div className="section-heading">
    <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
    {href && <Link className="text-link" href={href}>{linkText} <span aria-hidden="true">↗</span></Link>}
  </div>;
}

export function ActionCard({ id, prominent = false, note }: { id: ToolId; prominent?: boolean; note?: string }) {
  return <Link href={toolPath(id)} className={`action-card tone-${toolTone(id)}${prominent ? " action-card-prominent" : ""}`}>
    <ToolIcon id={id} large={prominent} />
    <span className="action-card-copy"><strong>{tools[id].label}</strong><small>{note ?? tools[id].description}</small></span>
    <span className="card-arrow" aria-hidden="true">↗</span>
  </Link>;
}

export function FileVisual({ kind }: { kind: "hero" | "compress" | "convert" | "scans" | "multi" | "pdf" | "image" | "office" }) {
  if (kind === "image") return <div className="capability-visual image-visual" aria-hidden="true">
    <div className="image-preview"><div className="image-landscape"><span className="image-sun"/><span className="mountain-one"/><span className="mountain-two"/></div>
      <div className="image-caption"><strong>Example · original</strong><span>4000 × 3000 · 8.4 MB</span></div></div>
    <span className="visual-flow-arrow">→</span>
    <div className="image-preview image-preview-after"><div className="image-landscape"><span className="image-sun"/><span className="mountain-one"/><span className="mountain-two"/></div>
      <div className="image-caption"><strong>Example · optimized</strong><span>1920 × 1440 · 1.6 MB</span></div></div>
  </div>;
  if (kind === "scans") return <div className="capability-visual scans-visual" aria-hidden="true">
    <div className="scan-page"><div/><div/><div/><div/><div/><span className="scan-overlay">TEXT DETECTED</span></div>
    <span className="visual-flow-arrow">→</span>
    <div className="scan-output"><span>DOCX</span><div/><div/><div/><div/></div>
  </div>;
  if (kind === "office" || kind === "convert") return <div className="capability-visual office-visual" aria-hidden="true">
    <div className="office-orbit"><span className="office-node node-word">W</span><span className="office-node node-excel">X</span>
      <span className="office-node node-pdf">PDF</span><span className="office-node node-pptx">P</span><span className="orbit-line orbit-one"/><span className="orbit-line orbit-two"/>
      <span className="orbit-center">↔</span></div>
  </div>;
  if (kind === "multi") return <div className="capability-visual multi-visual" aria-hidden="true">
    <span className="mini-file tone-pdf">PDF</span><span className="mini-file tone-word">DOC</span><span className="mini-file tone-image">IMG</span>
    <span className="multi-connector">→</span><span className="multi-target">ONE<br/>FLOW</span>
  </div>;
  if (kind === "compress") return <div className="capability-visual compress-visual" aria-hidden="true">
    <span className="compress-disc compress-before">8.4 <small>MB</small></span><span className="compress-arrow">→</span>
    <span className="compress-disc compress-after">1.6 <small>MB</small></span>
  </div>;
  return <div className={`capability-visual ${kind === "pdf" ? "pdf-visual" : "hero-visual"}`} aria-hidden="true">
    <div className="document-stack stack-back"/><div className="document-stack stack-mid"/>
    <div className="document-stack stack-front"><div className="doc-top"><span>FILEBOX</span><span>PDF</span></div>
      <div className="doc-line wide"/><div className="doc-line"/><div className="doc-line medium"/>
      <div className="doc-chart"><i/><i/><i/><i/></div><div className="doc-line medium"/><div className="doc-line short"/></div>
    <span className="visual-spark spark-one">✦</span><span className="visual-spark spark-two">✦</span>
  </div>;
}
