# PPTX conversions

- `POST /files/pptx/to-pdf`: one `.pptx` file, using the existing LibreOffice PDF exporter.
- `POST /files/pdf/to-pptx`: one PDF, reconstructed as a PowerPoint deck.

Local mode uses multipart field `file` and returns `converted`, downloadable through
`GET /files/download/:filename`. R2 mode uses the existing signed `file` object reference
and returns `output` and an attachment `downloadUrl`. Inputs and failed outputs use the
existing lifecycle cleanup. Successful local outputs retain the normal TTL.

Both endpoints use the very-heavy limiter and queue. Batch conversion accepts PPTX → PDF
and PDF → PPTX. Any batch with a PPTX source or target uses one very-heavy job slot and
quota; other batches keep their heavy class. Unsupported combinations are rejected
before conversion. Standalone ZIP can include PPTX. Mixed-file PDF merge retains its
previous supported types.

PPTX uses the existing `FILE_LIMIT_OFFICE_MB` limit (30 MiB by default), MIME type
`application/vnd.openxmlformats-officedocument.presentationml.presentation`, and OOXML
package validation. Legacy `.ppt` is rejected. R2 keys and MIME handling include `.pptx`.
No additional R2 credentials or bucket paths are required. If browser CORS rules restrict
MIME types, allow the PPTX MIME type as well.

## Runtime setup

Install the Python packages with the same `python` executable used by the backend:

```sh
python -m pip install -r requirements-presentation.txt
```

LibreOffice must be installed with its Impress component. Continue setting `SOFFICE_PATH`
on deployments where the executable is outside the existing default Windows location.
PPTX → PDF shares the existing serialized LibreOffice profile and timeout.

## Reconstruction limits

PDFs do not store PowerPoint layout semantics. Text is reconstructed as editable line
boxes with approximate fonts, styling and alignment. Images are separate movable objects.
Complete ruled rectangular grids become editable tables. Simple lines and rectangles
become native shapes. Curves and other artwork use localized raster images, leaving
nearby text editable. Scanned pages remain images; this endpoint does not perform OCR.

PowerPoint uses one slide size for the whole deck. Uniform PDF pages keep their dimensions;
mixed-size pages are centered on a common canvas without distortion. Pages beyond
PowerPoint's size limit are uniformly scaled. Font substitution, clipping, transparency,
unusual text transforms, complex table layouts, and intricate layering can differ from
the PDF. PDF charts are reconstructed from their visible objects, not as native data charts.
The response reports reconstructed object counts and whether page sizes were mixed.

## Targeted tests

```sh
node test/presentationConversion.test.js
node test/presentationConversion.test.js --r2
```

The R2 run uses in-memory mocks, never real credentials. Tests generate a small two-slide
PPTX plus geometry/scanned PDF cases in a temporary test directory, reuse `mixed-content.pdf`
and `table-ledger.pdf`, and verify native object types, cell text, slide order, real HTTP
responses, batch ZIPs, validation, queue class, and cleanup. Set `KEEP_PRESENTATION_TEST=1`
to retain artifacts for visual inspection.
