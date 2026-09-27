Set `NEXT_PUBLIC_FILEBOX_API_URL` to the backend origin (for example, `http://localhost:3001`). Set `NEXT_PUBLIC_FILE_STORAGE_MODE=local` or `r2` to match the backend's `FILE_STORAGE_MODE`. If backend file limits are overridden, set matching `NEXT_PUBLIC_FILE_LIMIT_IMAGE_MB` and `NEXT_PUBLIC_FILE_LIMIT_PDF_MB` values.

Both compression examples use the same flow:

```ts
import { downloadResult, runCompression } from "@/lib/filebox";

const result = await runCompression("image-compress", imageFile, setProcessingState);
// Or: runCompression("pdf-compress", pdfFile, setProcessingState)
if (result) await downloadResult(result);
```

`runCompression` chooses multipart local upload or browser-to-R2 upload from the configured mode. R2 browser access also requires bucket CORS permission for the frontend origin, PUT, GET, and the `Content-Type` header.
