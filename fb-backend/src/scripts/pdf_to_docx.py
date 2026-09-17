import sys
from pdf2docx import Converter


def main():
    if len(sys.argv) != 3:
        print("Usage: pdf_to_docx.py <input.pdf> <output.docx>", file=sys.stderr)
        sys.exit(1)

    input_path, output_path = sys.argv[1], sys.argv[2]

    cv = Converter(input_path)
    try:
        cv.convert(
            output_path,
            list_not_table=True
            )
    finally:
        cv.close()


if __name__ == "__main__":
    main()