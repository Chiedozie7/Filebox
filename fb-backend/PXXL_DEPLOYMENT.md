# FileForge backend on Pxxl

Select this repository as a **Web Service**, with `fb-backend` as its base
directory (the Git repository root is its parent). Review the detected plan
against [pxxl.toml](pxxl.toml) before deploying:

| Pxxl setting | Value |
| --- | --- |
| Runtime | Node.js 22, npm, one instance |
| Port | 5000; the server uses Pxxl's `PORT` if provided |
| Install | `npm ci --omit=dev && python3 -m virtualenv --python=python3 .venv && .venv/bin/python -m pip install --no-cache-dir -r requirements-production.txt` |
| Build | Empty; this backend has no compilation step |
| Start | `mkdir -p uploads && PATH=$PWD/.venv/bin:$PATH node src/server.js` |
| HTTP health check | `GET /health` (cheap, not rate-limited or queued) |

Pxxl's `node-npm:26` build has an Alpine-style package repository. The build
plan requests `python3`, `py3-pip`, and `py3-virtualenv`. It uses the packaged
`virtualenv` module to create `.venv` with pip, then installs
`requirements-production.txt` into that environment. The runtime requests
`python3`, `libreoffice-common`, `libreoffice-writer`, `libreoffice-calc`, and
`libreoffice-impress`. Alpine's `libreoffice-common` provides
`/usr/bin/soffice`. The Python requirements include `pdf2docx`, `pdfplumber`,
`python-docx`, PyMuPDF, Pillow, `python-pptx`, NumPy, and
`opencv-python-headless`. The latter supplies `cv2` for OCR table detection;
the headless package avoids a GUI dependency. Every conversion service invokes
`python`, so the start command puts the built virtual environment first on
`PATH`. `SOFFICE_PATH=/usr/bin/soffice` replaces the Windows-only default.

Pxxl [documents these `pxxl.toml` build and package fields](https://docs.pxxl.app/api/pxxl-toml).
The [Alpine package index](https://pkgs.alpinelinux.org/) confirms these package
names. If the builder does not carry the generated `.venv` into the final
runtime, a compatible builder or custom image is still needed. Confirm both
`python` and `/usr/bin/soffice` exist in the final runtime. PyPI's
`opencv-python-headless` release has glibc Linux wheels but no musl wheel;
on Alpine, installing `requirements-production.txt` may next attempt a large
OpenCV source build. That is a separate possible blocker to verify in the
next Pxxl build. LibreOffice startup/conversion can also exceed a
small 0.5-vCPU/512-MB instance's memory or time budget; review Pxxl's
[compute settings](https://docs.pxxl.app/projects/compute) before live traffic.

## Runtime environment

The non-secret defaults `NODE_ENV=production`, `FILE_STORAGE_MODE=r2`, and
`SOFFICE_PATH=/usr/bin/soffice` are in `pxxl.toml`. Set these **server-only**
values in Pxxl Secrets, not in Git or frontend code:

| Variable | Purpose |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_BUCKET` | Private R2 bucket name |
| `R2_ACCESS_KEY_ID` | Bucket-scoped R2 S3 API access key |
| `R2_SECRET_ACCESS_KEY` | Matching secret key |
| `R2_REF_SIGNING_SECRET` | Independent random signing secret, at least 32 bytes |
| `DATABASE_URL` | PostgreSQL connection for permanent `/files/upload`, `GET /files`, and safe local-file cleanup |

The database must already contain the `files` table used by the repository;
this repo has no migration command or schema file. R2 conversion calls do not
write file records, but the cleanup sweep consults the table before deleting
stale local files. If that lookup fails, local stale-file deletion is skipped
to protect permanent uploads. Set `DATABASE_URL` for complete backend behavior.

Useful optional settings, with current defaults:

| Variable | Default / use |
| --- | --- |
| `FILE_CLEANUP_TTL_MINUTES` | `30`; local outputs and R2 objects |
| `R2_UPLOAD_URL_SECONDS`, `R2_DOWNLOAD_URL_SECONDS` | `300` each |
| `TRUST_PROXY_HOPS` | `0`; set to the verified number of trusted Pxxl proxy hops (often `1`) so per-IP limits use the client IP |
| `JOB_QUEUE_HEAVY_CONCURRENCY`, `JOB_QUEUE_VERY_HEAVY_CONCURRENCY`, `JOB_QUEUE_MAX_WAITING` | `2`, `1`, `10`; keep conservative on small instances |
| `RATE_LIMIT_LIGHT_MAX`, `RATE_LIMIT_HEAVY_MAX`, `RATE_LIMIT_VERY_HEAVY_MAX` | `60`/minute, `5`/10 minutes, `3`/10 minutes per IP |
| `FILE_LIMIT_*` | Configurable size/count/page limits in `src/config/fileLimits.js`; leave defaults unless capacity is measured |

Pxxl [stores project secrets for build and runtime](https://docs.pxxl.app/projects/secrets).
Keep this service at one replica: its queue, rate limits, and active-file
protection are in memory per process.

## Browser access and storage

Set `CORS_ALLOWED_ORIGINS` in Pxxl Secrets to a comma-separated list of exact
frontend origins, for example `https://<your-deployed-frontend-host>`. Include
the scheme and hostname, with no path. Production allows only those origins;
an empty setting denies cross-origin browser requests. Development also
allows localhost and loopback on ports 3000 and 3001. Requests without an
`Origin` header remain available for command-line and server-to-server clients.
An unexpected browser origin receives JSON `403 {"error":"Origin not allowed"}`.

The API permits `GET`, `HEAD`, `POST`, and preflight `OPTIONS`; accepts
`Content-Type` and `X-Request-ID`; and exposes `Content-Disposition`, request
ID, and rate-limit headers. It does not enable credentialed CORS. CORS is not
authentication.

For direct browser uploads/downloads, configure the **R2 bucket CORS** with
the actual frontend origin, `PUT` and `GET`, and `Content-Type` as an allowed
request header. The backend signs short-lived PUT/GET URLs. Inputs are deleted
after processing, and outputs are removed by the 30-minute sweep. A Cloudflare
R2 lifecycle rule for `temp/` is a coarse fallback during server outages. See
[R2.md](R2.md) for the request flow and validation limits.

The process must be able to write `uploads/` in its working directory even in
R2 mode: remote inputs are staged there and outputs are uploaded from there.
Python, OCR, Excel, and LibreOffice also write to the system temp directory
(normally `/tmp`), including a LibreOffice profile under
`/tmp/filebox-lo-profile`. The startup command creates `uploads/`; make sure
the runtime user can write both locations. R2 mode does not need durable local
storage for processing. Permanent `/files/upload` and local-mode outputs need
a persistent volume if they must survive restarts/deployments; the current code
uses the fixed `uploads/` path. Pxxl [supports mounted persistent volumes](https://docs.pxxl.app/projects/compute).

OCR uses `tesseract.js`; arrange runtime access to its language data or a
working cache for `eng` before relying on OCR. `/health` does not check R2,
PostgreSQL, LibreOffice, Python, or OCR, so check those separately after a
deployment. Pxxl [publishes a Web Service after its health check passes](https://docs.pxxl.app/projects/how-pxxl-builds).
