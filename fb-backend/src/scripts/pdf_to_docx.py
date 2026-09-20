import sys
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.text.run import Run
from pdf2docx import Converter
from pdf2docx.common import docx as pdf2docx_docx


def add_hyperlink(paragraph, url, text):
    relationship_id = paragraph.part.relate_to(
        url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relationship_id)
    hyperlink.set(qn("w:history"), "1")

    inner_run = OxmlElement("w:r")
    run = Run(inner_run, paragraph)
    run.text = text
    run_properties = inner_run.get_or_add_rPr()
    style = OxmlElement("w:rStyle")
    style.set(qn("w:val"), "Hyperlink")
    run_properties.append(style)

    hyperlink.append(inner_run)
    paragraph._p.append(hyperlink)
    return run


def main():
    if len(sys.argv) != 3:
        print("Usage: pdf_to_docx.py <input.pdf> <output.docx>", file=sys.stderr)
        sys.exit(1)

    input_path, output_path = sys.argv[1], sys.argv[2]

    cv = Converter(input_path)
    original_add_hyperlink = pdf2docx_docx.add_hyperlink
    try:
        pdf2docx_docx.add_hyperlink = add_hyperlink
        cv.convert(
            output_path,
            list_not_table=True
            )
    finally:
        pdf2docx_docx.add_hyperlink = original_add_hyperlink
        cv.close()


if __name__ == "__main__":
    main()
