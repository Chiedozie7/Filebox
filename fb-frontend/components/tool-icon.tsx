import { tools, type ToolId } from "@/lib/filebox";

export function toolTone(id: ToolId): string {
  if (id === "ocr-to-word") return "ocr";
  if (id.startsWith("image-")) return "image";
  if (id.includes("excel")) return "excel";
  if (id.includes("word")) return "word";
  if (id.includes("pptx")) return "pptx";
  if (id === "batch-convert" || id === "zip") return "product";
  return "pdf";
}

export function ToolIcon({ id, large = false }: { id: ToolId; large?: boolean }) {
  const tone = toolTone(id);
  const mark = tone === "image" ? "IMG" : tone === "excel" ? "XLS" : tone === "word" ? "DOC" :
    tone === "pptx" ? "PPT" : tone === "ocr" ? "OCR" : tone === "pdf" ? "PDF" : "BOX";
  return <span className={`tool-icon tone-${tone}${large ? " tool-icon-large" : ""}`}
    aria-hidden="true" title={tools[id].label}><span>{mark}</span></span>;
}
