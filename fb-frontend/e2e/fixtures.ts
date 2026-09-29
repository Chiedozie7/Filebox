import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface FilePayload { name: string; mimeType: string; buffer: Buffer }

type Kind = "png" | "pdf" | "docx" | "xlsx";

const sources: Record<Kind, { fixture: string; mimeType: string; fallback: Buffer }> = {
  png: {
    fixture: "transparent.png", mimeType: "image/png",
    fallback: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lfoAAAAASUVORK5CYII=", "base64"),
  },
  pdf: {
    fixture: "mixed-content.pdf", mimeType: "application/pdf",
    fallback: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"),
  },
  docx: {
    fixture: "operations-report.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fallback: Buffer.from("PK\u0003\u0004sample-docx"),
  },
  xlsx: {
    fixture: "operations-workbook.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fallback: Buffer.from("PK\u0003\u0004sample-xlsx"),
  },
};

export function inputFile(kind: Kind, name?: string): FilePayload {
  const source = sources[kind];
  const fixture = resolve(process.cwd(), "../fb-backend/test-files", source.fixture);
  return {
    name: name ?? source.fixture,
    mimeType: source.mimeType,
    buffer: existsSync(fixture) ? readFileSync(fixture) : source.fallback,
  };
}
