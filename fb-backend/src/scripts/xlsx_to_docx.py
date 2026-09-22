import posixpath
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.shared import Inches, Pt


MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def column_index(reference):
    letters = re.match(r"[A-Z]+", reference).group()
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result - 1


def coordinate(reference):
    return int(re.search(r"\d+", reference).group()) - 1, column_index(reference)


def shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.itertext()) for node in root.findall(f"{{{MAIN}}}si")]


def cell_text(cell, strings):
    kind = cell.get("t")
    value = cell.find(f"{{{MAIN}}}v")
    formula = cell.find(f"{{{MAIN}}}f")
    if kind == "inlineStr":
        inline = cell.find(f"{{{MAIN}}}is")
        return "" if inline is None else "".join(inline.itertext())
    if value is not None and value.text is not None:
        if kind == "s":
            return strings[int(value.text)]
        if kind == "b":
            return "TRUE" if value.text == "1" else "FALSE"
        return value.text
    return f"={formula.text}" if formula is not None and formula.text else ""


def worksheet_path(target):
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join("xl", target))


def read_sheets(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        item.get("Id"): worksheet_path(item.get("Target"))
        for item in relationships.findall(f"{{{PACKAGE_REL}}}Relationship")
        if item.get("Type", "").endswith("/worksheet")
    }
    strings = shared_strings(archive)

    for sheet in workbook.findall(f"{{{MAIN}}}sheets/{{{MAIN}}}sheet"):
        relationship_id = sheet.get(f"{{{OFFICE_REL}}}id")
        root = ET.fromstring(archive.read(targets[relationship_id]))
        values = {}
        max_row = max_col = -1
        for cell in root.findall(f"{{{MAIN}}}sheetData/{{{MAIN}}}row/{{{MAIN}}}c"):
            row, col = coordinate(cell.get("r"))
            text = cell_text(cell, strings)
            if text:
                values[row, col] = text
                max_row, max_col = max(max_row, row), max(max_col, col)

        merges = []
        for merged in root.findall(f"{{{MAIN}}}mergeCells/{{{MAIN}}}mergeCell"):
            start, end = merged.get("ref").split(":")
            first, last = coordinate(start), coordinate(end)
            merges.append((first, last))
            max_row, max_col = max(max_row, last[0]), max(max_col, last[1])

        yield sheet.get("name"), values, max_row + 1, max_col + 1, merges


def add_sheet(document, name, values, row_count, column_count, merges):
    document.add_heading(name, level=1)
    row_count = max(1, row_count)
    column_count = max(1, column_count)
    table = document.add_table(rows=row_count, cols=column_count)
    table.style = "Table Grid"
    table.autofit = False

    section = document.sections[0]
    available_width = section.page_width - section.left_margin - section.right_margin
    weights = []
    for col in range(column_count):
        longest = max(
            (len(line) for row in range(row_count)
             for line in values.get((row, col), "").splitlines()),
            default=0,
        )
        weights.append(max(8, min(24, longest)))
    total_weight = sum(weights)

    for col, weight in enumerate(weights):
        table.columns[col].width = int(available_width * weight / total_weight)
    for row in range(row_count):
        for col in range(column_count):
            cell = table.cell(row, col)
            cell.width = table.columns[col].width
            cell.text = values.get((row, col), "")
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(0)
                for run in paragraph.runs:
                    run.font.size = Pt(8.5)

    for (first_row, first_col), (last_row, last_col) in merges:
        merged = table.cell(first_row, first_col).merge(table.cell(last_row, last_col))
        for paragraph in list(merged.paragraphs)[1:]:
            if not paragraph.text:
                paragraph._element.getparent().remove(paragraph._element)


def main():
    if len(sys.argv) != 3:
        print("Usage: xlsx_to_docx.py <input.xlsx> <output.docx>", file=sys.stderr)
        sys.exit(1)

    document = Document()
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = Inches(11.7), Inches(8.3)
    section.left_margin = section.right_margin = Inches(0.6)
    section.top_margin = section.bottom_margin = Inches(0.6)

    with zipfile.ZipFile(sys.argv[1]) as archive:
        sheets = list(read_sheets(archive))
    for index, sheet in enumerate(sheets):
        if index:
            document.add_page_break()
        add_sheet(document, *sheet)

    document.save(sys.argv[2])
    print(len(sheets))


if __name__ == "__main__":
    main()
