import Link from "next/link";
import Image from "next/image";
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
  if (kind === "image") return <div className="capability-visual image-visual motion-scene" aria-hidden="true">
    <div className="image-preview image-preview-before">
      <div className="image-photo"><Image src="/alpine-lake-landscape.png" alt="" fill sizes="(max-width: 800px) 45vw, 270px" quality={80} /></div>
      <div className="image-caption"><strong>Example · original</strong><span>4000 × 3000 · 8.4 MB</span></div>
    </div>
    <span className="image-transfer"><span>RESIZE + COMPRESS</span><i>→</i></span>
    <div className="image-preview image-preview-after">
      <div className="image-photo"><Image src="/alpine-lake-landscape.png" alt="" fill sizes="(max-width: 800px) 40vw, 240px" quality={75} /></div>
      <div className="image-caption"><strong>Example · optimized</strong><span>1920 × 1440 · 1.6 MB</span></div>
    </div>
    <span className="image-measure measure-top"/><span className="image-measure measure-side"/>
  </div>;
  if (kind === "scans") return <div className="capability-visual scans-visual motion-scene" aria-hidden="true">
    <div className="scan-page"><div className="scan-heading"/><div className="scan-text"/><div className="scan-text short"/>
      <div className="scan-table"><i/><i/><i/><i/><i/><i/></div><div className="scan-text"/>
      <span className="scan-beam"/><span className="detection-box detect-text"/><span className="detection-box detect-table"/>
      <span className="scan-stamp">SCAN</span></div>
    <span className="scan-transfer">→</span>
    <div className="scan-output"><strong>DOCX</strong><div className="editable-line"/><div className="editable-line medium"/>
      <div className="editable-grid"><i/><i/><i/><i/></div><div className="editable-line short"/><span className="edit-cursor"/></div>
    <span className="scan-label">TEXT + TABLES DETECTED</span>
  </div>;
  if (kind === "convert") return <div className="capability-visual convert-visual motion-scene" aria-hidden="true">
    <div className="convert-file convert-source"><span>PDF</span><i/><i/><i/></div>
    <span className="convert-path"><i/><b>→</b></span>
    <div className="convert-file convert-destination"><span>DOCX</span><i/><i/><i/></div>
    <span className="convert-caption">FORMAT IN · EDITABLE OUT</span>
  </div>;
  if (kind === "office") return <div className="capability-visual office-visual motion-scene" aria-hidden="true">
    <div className="office-orbit"><span className="orbit-line orbit-one"/><span className="orbit-line orbit-two"/>
      <span className="office-route route-one"/><span className="office-route route-two"/>
      <span className="office-node node-word">W<small>WORD</small></span><span className="office-node node-excel">X<small>EXCEL</small></span>
      <span className="office-node node-pdf">PDF<small>PDF</small></span><span className="office-node node-pptx">P<small>PPTX</small></span>
      <span className="orbit-center">↔</span></div>
    <span className="office-caption">DOCUMENTS, IN EVERY DIRECTION</span>
  </div>;
  if (kind === "multi") return <div className="capability-visual multi-visual motion-scene" aria-hidden="true">
    <div className="multi-inputs"><span className="mini-file tone-pdf">PDF</span><span className="mini-file tone-word">DOC</span>
      <span className="mini-file tone-image">IMG</span></div>
    <span className="multi-flow">→</span><span className="multi-hub">PROCESS<i/></span><span className="multi-flow">→</span>
    <div className="multi-outputs"><span>ZIP</span><span>MERGED PDF</span><span>BATCH</span></div>
  </div>;
  if (kind === "compress") return <div className="capability-visual compress-visual motion-scene" aria-hidden="true">
    <span className="compress-disc compress-before">8.4 <small>MB</small></span><span className="compress-arrow">→</span>
    <span className="compress-disc compress-after">1.6 <small>MB</small></span><span className="compress-caption">SAME FILE · LESS WEIGHT</span>
  </div>;
  if (kind === "pdf") return <div className="capability-visual pdf-visual motion-scene" aria-hidden="true">
    <div className="pdf-page-deck"><span className="pdf-page page-one"><i/><i/><i/></span>
      <span className="pdf-page page-two"><i/><i/><i/></span><span className="pdf-page page-three"><i/><i/><i/></span></div>
    <span className="pdf-flow-line"/><div className="pdf-output"><strong>PDF</strong><span>ONE RESULT</span></div>
    <div className="pdf-operations"><span>01 / SPLIT</span><span>02 / MERGE</span><span>03 / CONVERT</span></div>
  </div>;
  return <div className="capability-visual hero-visual motion-scene" aria-hidden="true">
    <div className="document-stack stack-back"/><div className="document-stack stack-mid"/>
    <div className="document-stack stack-front"><div className="doc-top"><span>FILEBOX</span><span>NEXT STEP</span></div>
      <div className="doc-line wide"/><div className="doc-line"/><div className="doc-line medium"/>
      <div className="doc-chart"><i/><i/><i/><i/></div><div className="doc-line medium"/><div className="doc-line short"/>
      <div className="hero-file-states"><span>PDF</span><span>DOC</span><span>XLS</span><span>IMG</span></div></div>
    <span className="hero-orbit hero-orbit-two">↗</span>
    <span className="hero-next-step">FILE → NEXT STEP</span>
  </div>;
}
