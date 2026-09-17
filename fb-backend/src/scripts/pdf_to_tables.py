import sys
import json
import pdfplumber


def main():
    if len(sys.argv) != 2:
        print("Usage: pdf_to_tables.py <input.pdf>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    pages_output = []

    with pdfplumber.open(input_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables()

            if tables:
                pages_output.append({
                    "page": page_number,
                    "tables": tables,
                })

    print(json.dumps(pages_output))


if __name__ == "__main__":
    main()