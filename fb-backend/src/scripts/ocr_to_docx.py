import json
import re
import sys
from pathlib import Path


def render_pdf(input_path, output_dir):
    import pymupdf as fitz

    output = Path(output_dir)
    pages = []
    with fitz.open(input_path) as document:
        for index, page in enumerate(document):
            image_path = output / f"page-{index + 1:04d}.png"
            page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(image_path)
            pages.append(str(image_path))
    print(json.dumps(pages))


def write_docx(text_path, output_path):
    from docx import Document
    from docx.shared import Inches, Pt

    pages = json.loads(Path(text_path).read_text(encoding="utf-8"))
    document = Document()
    section = document.sections[0]
    section.top_margin = section.bottom_margin = Inches(0.8)
    section.left_margin = section.right_margin = Inches(0.8)
    normal = document.styles["Normal"]
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)

    for index, page_text in enumerate(pages):
        if index:
            document.add_page_break()
        normalized = page_text.replace("\r\n", "\n").replace("\r", "\n").strip()
        for block in re.split(r"\n\s*\n", normalized):
            lines = [line.strip() for line in block.splitlines() if line.strip()]
            if lines:
                document.add_paragraph("\n".join(lines))

    document.save(output_path)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: ocr_to_docx.py render-pdf|write-docx input output")
    if sys.argv[1] == "render-pdf":
        render_pdf(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "write-docx":
        write_docx(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit("Unsupported command")
