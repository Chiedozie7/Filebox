# FileForge backend on Pxxl

Select this repository as a **Web Service**, with `fb-backend` as its base
directory (the Git repository root is its parent). Review the detected plan
against [pxxl.toml](pxxl.toml) before deploying:

| Pxxl setting | Value |
| --- | --- |
| Runtime | Node.js 22, npm, one instance |
| Port | 5000; the server uses Pxxl's `PORT` if provided |
| Install | Use the `installCommand` in `pxxl.toml`: npm install, virtualenv, Pxxl Python requirements, then `pdf2docx` without its pip-managed OpenCV dependency |
| Build | Empty; this backend has no compilation step |
| Start | `mkdir -p /tmp/filebox-uploads && UPLOAD_DIR=/tmp/filebox-uploads PATH=$PWD/.venv/bin:$PATH node src/server.js` |
| HTTP health check | `GET /health` (cheap, not rate-limited or queued) |

Pxxl's `node-npm:26` build currently installs Alpine Python 3.14.7. Its package
repository has no documented Python 3.12/3.13 selector for this build plan.
The build requests `python3`, `py3-pip`, `py3-virtualenv`, and `py3-opencv`;
the runtime also requests `py3-opencv`. The latter is Alpine's prebuilt OpenCV
4.13.0 package for Python 3.14 and supplies `cv2` for OCR table detection.
Pxxl creates `.venv` with `--system-site-packages` so it can import that
prebuilt package. It installs [requirements-pxxl.txt](requirements-pxxl.txt),
then `pdf2docx==0.5.13` with `--no-deps` because pip cannot equate Alpine's
`py3-opencv` with the `opencv-python-headless` package name. The Pxxl file
lists pdf2docx's other dependencies, including `fonttools` and `fire`. The
install command checks that both `cv2` and `pdf2docx` import. The normal
`requirements-production.txt` and `requirements-presentation.txt` remain
unchanged for non-Pxxl environments; their OpenCV range needs no additional
version pin.

The runtime also requests `python3`, `libreoffice-common`,
`libreoffice-writer`, `libreoffice-calc`, and `libreoffice-impress`. Alpine's
`libreoffice-common` provides `/usr/bin/soffice`. Every conversion service
invokes `python`, so the start command puts the built virtual environment first
on `PATH`. `SOFFICE_PATH=/usr/bin/soffice` replaces the Windows-only default.

Pxxl [documents these `pxxl.toml` build and package fields](https://docs.pxxl.app/api/pxxl-toml).
The [Alpine package index](https://pkgs.alpinelinux.org/) confirms these package
names. If the builder does not carry the generated `.venv` into the final
runtime, a compatible builder or custom image is still needed. Confirm both
`python`, `cv2`, and `/usr/bin/soffice` exist in the final runtime. PyPI's
`opencv-python-headless` releases have glibc Linux wheels but no musl wheel;
pinning Python to 3.12 or 3.13 on Alpine would still trigger a source build.
The Alpine package is a prebuilt binary package, not a PyPI wheel. If Pxxl
requires an actual PyPI OpenCV wheel, it needs a glibc-based build image.
LibreOffice startup/conversion can also exceed a
small 0.5-vCPU/512-MB instance's memory or time budget; review Pxxl's
[compute settings](https://docs.pxxl.app/projects/compute) before live traffic.

## Runtime environment

The non-secret defaults `NODE_ENV=production`, `FILE_STORAGE_MODE=r2`,
`UPLOAD_DIR=/tmp/filebox-uploads`, and `SOFFICE_PATH=/usr/bin/soffice` are in
`pxxl.toml`. Set these **server-only**
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
write file records. Cleanup consults the table before deleting stale files on
durable local storage; if that lookup fails, local deletion is skipped to
protect permanent uploads. Pxxl's ephemeral staging has no permanent uploads,
so its cleanup does not need that lookup. Set `DATABASE_URL` for complete
database-backed API behavior.

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

`UPLOAD_DIR` defaults to the backend's `uploads/` directory for local
development. On Pxxl, it points to writable `/tmp/filebox-uploads` for Multer
uploads, R2 staging, generated outputs, and local cleanup. The startup command
creates it. Python, OCR, Excel, and LibreOffice also write under `/tmp`,
including a LibreOffice profile under `/tmp/filebox-lo-profile`. `/tmp` is
ephemeral: files can disappear on restart or deployment, so local download
links there are temporary. R2 outputs remain in R2. The legacy permanent
`POST /files/upload` returns 503 in production when `UPLOAD_DIR` is under the
system temporary directory, because its database record would otherwise point
to an ephemeral file. For permanent local uploads in production, configure
`UPLOAD_DIR` on a durable writable volume. Pxxl [supports mounted persistent volumes](https://docs.pxxl.app/projects/compute).

OCR uses `tesseract.js`; arrange runtime access to its language data or a
working cache for `eng` before relying on OCR. `/health` does not check R2,
PostgreSQL, LibreOffice, Python, or OCR, so check those separately after a
deployment. Pxxl [publishes a Web Service after its health check passes](https://docs.pxxl.app/projects/how-pxxl-builds).
