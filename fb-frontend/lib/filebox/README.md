Set `NEXT_PUBLIC_FILEBOX_API_URL` to the backend origin (for example, `http://localhost:3001`). Set `NEXT_PUBLIC_FILE_STORAGE_MODE=local` or `r2` to match the backend's `FILE_STORAGE_MODE`. If backend file limits are overridden, set the matching `NEXT_PUBLIC_FILE_LIMIT_*` values used in `config.ts`.

All tool pages live at `/tools/<tool-id>` and use the same form. The home page lists the available IDs. The integration can also be used directly:

```ts
import { downloadResult, runTool } from "@/lib/filebox";

const result = await runTool("image-compress", [imageFile], {}, setProcessingState);
if (result) await downloadResult(result);
```

`runTool` chooses multipart local upload or browser-to-R2 upload from the configured mode. R2 browser access also requires bucket CORS permission for the frontend origin, PUT, GET, and the `Content-Type` header. The backend does not expose queue progress, so the UI shows upload and processing phases without percentages or queue positions.
