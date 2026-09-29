import { tools, type ToolId } from "./config";

export const toolPath = (id: ToolId) => `/tools/${id}`;

export const navGroups = [
  { name: "PDF", ids: ["pdf-compress", "pdf-split", "pdf-merge", "pdf-unlock", "pdf-to-word", "pdf-to-excel", "pdf-to-pptx"] },
  { name: "Images", ids: ["image-compress", "image-resize", "image-convert", "batch-convert"] },
  { name: "Office", ids: ["word-to-pdf", "word-to-excel", "excel-to-pdf", "excel-to-word", "pptx-to-pdf"] },
  { name: "Other", ids: ["ocr-to-word", "batch-convert", "zip"] },
] as const satisfies readonly { name: string; ids: readonly ToolId[] }[];

export const quickTools: ToolId[] = ["pdf-compress", "pdf-to-word", "image-compress", "ocr-to-word", "pdf-merge"];

export const searchAliases: Partial<Record<ToolId, readonly string[]>> = {
  "image-compress": ["make image smaller", "reduce photo size", "shrink image"],
  "pdf-compress": ["make pdf smaller", "reduce pdf size", "shrink pdf"],
  "pdf-merge": ["merge files", "combine pdfs", "combine documents"],
  "ocr-to-word": ["scan to word", "scanned pdf to word", "extract text", "editable scan"],
  "batch-convert": ["convert multiple files", "bulk conversion"],
  zip: ["zip files", "archive files"],
};

export function searchTools(query: string): ToolId[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return quickTools;
  const unique = Array.from(new Set(navGroups.flatMap(group => group.ids)));
  return unique.filter(id => {
    const haystack = [tools[id].label, tools[id].description, id.replaceAll("-", " "),
      ...(searchAliases[id] ?? [])].join(" ").toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

export const workflows = [
  { id: "compress", title: "Make files smaller", description: "Reduce PDF and image sizes for easier sharing.", href: "/workflows/compress", visual: "compress" },
  { id: "convert", title: "Convert documents", description: "Move between PDF, Word, Excel, and presentations.", href: "/workflows/convert", visual: "convert" },
  { id: "scans", title: "Work with scans", description: "Turn scanned pages into editable Word documents.", href: toolPath("ocr-to-word"), visual: "scans" },
  { id: "multi-file", title: "Handle multiple files", description: "Merge, convert in batches, or create a ZIP.", href: "/workflows/multi-file", visual: "multi" },
] as const;

export const discoveryPages = {
  pdf: {
    eyebrow: "PDF tools", title: "Make more of every PDF.",
    description: "Compress, split, merge, unlock, or convert. Choose the operation that matches what you need to do next.",
    primary: ["pdf-compress", "pdf-merge", "pdf-split"] as ToolId[],
    secondary: ["pdf-unlock", "pdf-to-word", "pdf-to-excel", "pdf-to-pptx"] as ToolId[],
    note: "Merge to PDF accepts PDFs, DOCX, XLSX, and supported images. Multiple PDFs work too.",
  },
  images: {
    eyebrow: "Image tools", title: "Shape images for where they go next.",
    description: "Reduce size, change dimensions, or switch formats with a focused tool for each task.",
    primary: ["image-compress", "image-resize", "image-convert"] as ToolId[],
    secondary: ["batch-convert"] as ToolId[],
    note: "Choose batch conversion when several images need the same output format.",
  },
  office: {
    eyebrow: "Document conversion", title: "Documents can change direction.",
    description: "Move between Word, Excel, PDF, and PPTX with a route for the source and output you need.",
    primary: ["word-to-pdf", "excel-to-pdf", "pdf-to-word"] as ToolId[],
    secondary: ["word-to-excel", "excel-to-word", "pdf-to-excel", "pdf-to-pptx", "pptx-to-pdf"] as ToolId[],
    note: "For scanned pages, use OCR to Word to extract editable text.",
  },
  compress: {
    eyebrow: "Workflow / Compression", title: "Make a file easier to send.",
    description: "Pick the right compressor for your file. Results show the original size, output size, and valid savings when available.",
    primary: ["pdf-compress", "image-compress"] as ToolId[], secondary: [] as ToolId[],
    note: "When compression cannot reduce size and the original is retained, the result says so.",
  },
  convert: {
    eyebrow: "Workflow / Conversion", title: "Start with the file you have.",
    description: "Choose a conversion based on your source file and desired result.",
    primary: ["pdf-to-word", "pdf-to-excel", "pdf-to-pptx", "word-to-pdf"] as ToolId[],
    secondary: ["word-to-excel", "excel-to-pdf", "excel-to-word", "pptx-to-pdf", "image-convert", "ocr-to-word"] as ToolId[],
    note: "Scanned pages usually need OCR before the text becomes editable.",
  },
  "multi-file": {
    eyebrow: "Workflow / Multiple files", title: "One batch. The right outcome.",
    description: "Choose whether to convert many files, combine them into one PDF, or simply package them together.",
    primary: ["batch-convert", "pdf-merge", "zip"] as ToolId[], secondary: [] as ToolId[],
    note: "Batch conversion returns a ZIP of converted files. Merge to PDF creates one PDF from mixed inputs. Create ZIP bundles files without converting them.",
  },
} as const;
