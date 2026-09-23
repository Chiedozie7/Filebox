import sys

import pymupdf


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: unlock_pdf.py <input.pdf> <output.pdf>")

    password = sys.stdin.read()
    try:
        document = pymupdf.open(sys.argv[1])
    except pymupdf.FileDataError:
        return 4

    with document:
        if not document.is_pdf:
            return 4
        if document.needs_pass:
            if not password:
                return 3
            if not document.authenticate(password):
                return 2
        document.save(sys.argv[2], encryption=pymupdf.PDF_ENCRYPT_NONE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
