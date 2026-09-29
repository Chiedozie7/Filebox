import { expect, test, type Page, type Request } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { inputFile } from "./fixtures";

test.skip(process.env.FILEBOX_E2E_MODE === "r2", "Local multipart mode only");

const multipart = (request: Request) => request.postDataBuffer()?.toString("latin1") ?? "";

function pending() {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { wait, release };
}

async function mockDownload(page: Page) {
  await page.route("**/files/download/*", route => route.fulfill({
    status: 200, contentType: "application/octet-stream", body: Buffer.from("downloaded-file"),
  }));
}

async function expectDownload(page: Page, filename: string) {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${filename}` }).click();
  expect((await downloaded).suggestedFilename()).toBe(filename);
}

test("image compression accepts a dropped file, downloads PNG, and resets", async ({ page }) => {
  const gate = pending();
  let request: Request | undefined;
  await page.route("**/files/compress", async route => {
    request = route.request();
    await gate.wait;
    await route.fulfill({ json: { message: "Image compressed", compressed: "compressed-1.png",
      originalSize: 4, compressedSize: 2 } });
  });
  await mockDownload(page);
  await page.goto("/tools/image-compress");
  await expect(page.locator(".drop-zone")).toHaveCSS("cursor", "pointer");
  await expect(page.locator(".choose-button")).toHaveCSS("cursor", "pointer");
  await page.locator(".drop-zone").focus();
  await expect(page.locator(".drop-zone")).toBeFocused();
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], "dropped.png", { type: "image/png" }));
    document.querySelector(".drop-zone")?.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, dataTransfer: transfer,
    }));
  });
  await expect(page.locator(".selected-files li")).toContainText("dropped.png");
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.getByText(/Uploading files/)).toBeVisible();
  await expect.poll(() => request).toBeDefined();
  expect(request?.url()).toContain("/files/compress");
  expect(multipart(request!)).toContain('name="file"; filename="dropped.png"');
  gate.release();
  await expect(page.getByText("compressed-1.png", { exact: true })).toBeVisible();
  await expect(page.getByText("Original size: 4 B")).toBeVisible();
  await expect(page.getByText("Output size: 2 B")).toBeVisible();
  await expect(page.getByText("Saved: 50%")).toBeVisible();
  await expectDownload(page, "compressed-1.png");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".selected-files li")).toHaveCount(0);
  await expect(page.getByText("compressed-1.png", { exact: true })).toHaveCount(0);
});

const simpleCases = [
  { tool: "pdf-compress", endpoint: "/files/pdf/compress", files: [inputFile("pdf")], field: "file", output: "compressed", filename: "compressed-2.pdf" },
  { tool: "image-resize", endpoint: "/files/resize", files: [inputFile("png")], field: "file", output: "resized", filename: "resized-1.png", options: { "Width (pixels)": "320", "Height (pixels)": "240" } },
  { tool: "excel-to-word", endpoint: "/files/excel/to-word", files: [inputFile("xlsx")], field: "file", output: "converted", filename: "converted-3.docx" },
  { tool: "pdf-to-pptx", endpoint: "/files/pdf/to-pptx", files: [inputFile("pdf")], field: "file", output: "converted", filename: "converted-4.pptx" },
  { tool: "zip", endpoint: "/files/zip", files: [inputFile("pdf"), inputFile("docx")], field: "files", output: "zip", filename: "files-5.zip" },
] as const;

for (const item of simpleCases) {
  test(`${item.tool} sends files and downloads ${item.filename}`, async ({ page }) => {
    const gate = pending();
    let request: Request | undefined;
    await page.route(`**${item.endpoint}`, async route => {
      request = route.request();
      await gate.wait;
      await route.fulfill({ json: { message: "Done", [item.output]: item.filename,
        ...(item.tool === "pdf-compress" ? { originalSize: 1000, compressedSize: 1000, retainedOriginal: true } : {}) } });
    });
    await mockDownload(page);
    await page.goto(`/tools/${item.tool}`);
    await page.getByLabel("Choose files").setInputFiles([...item.files]);
    await expect(page.locator(".selected-files li")).toHaveCount(item.files.length);
    if ("options" in item && item.options) {
      for (const [label, value] of Object.entries(item.options)) await page.getByLabel(label).fill(value);
    }
    if (item.tool === "zip") {
      await page.getByRole("button", { name: `Remove ${item.files[1].name}` }).click();
      await expect(page.locator(".selected-files li")).toHaveCount(1);
      await page.getByLabel("Choose files").setInputFiles(item.files[1]);
      await expect(page.locator(".selected-files li")).toHaveCount(2);
    }
    await page.getByRole("button", { name: "Process files" }).click();
    await expect(page.getByText(/Uploading files/)).toBeVisible();
    await expect.poll(() => request).toBeDefined();
    const body = multipart(request!);
    expect(request?.url()).toContain(item.endpoint);
    for (const file of item.files) expect(body).toContain(`name="${item.field}"; filename="${file.name}"`);
    if (item.tool === "image-resize") {
      expect(body).toMatch(/name="width"\r\n\r\n320/);
      expect(body).toMatch(/name="height"\r\n\r\n240/);
    }
    gate.release();
    await expect(page.getByText(item.filename, { exact: true })).toBeVisible();
    if (item.tool === "pdf-compress") {
      await expect(page.getByText("Original size: 1000 B")).toBeVisible();
      await expect(page.getByText("Output size: 1000 B")).toBeVisible();
      await expect(page.getByText("No size reduction. The original file was retained.")).toBeVisible();
      await expect(page.getByText(/Saved: /)).toHaveCount(0);
    }
    await expectDownload(page, item.filename);
    if (item.tool === "pdf-compress") {
      await page.getByRole("link", { name: "Merge to PDF" }).click();
      await expect(page).toHaveURL(/\/tools\/pdf-merge$/);
      await expect(page.getByRole("heading", { name: "Merge to PDF" })).toBeVisible();
    }
  });
}

test("PDF merge preserves the chosen order in multipart files", async ({ page }) => {
  const gate = pending();
  let request: Request | undefined;
  await page.route("**/files/pdf/merge", async route => {
    request = route.request();
    await gate.wait;
    await route.fulfill({ json: { message: "Merged", merged: "merged-6.pdf" } });
  });
  await mockDownload(page);
  await page.goto("/tools/pdf-merge");
  await expect(page.getByText(/Combine PDFs, Word documents, Excel files, and supported images/)).toBeVisible();
  await page.getByLabel("Choose files").setInputFiles([inputFile("pdf", "first.pdf"), inputFile("pdf", "second.pdf")]);
  await expect(page.locator(".selected-files li")).toHaveCount(2);
  await page.getByRole("button", { name: "Move second.pdf up" }).click();
  await expect(page.locator(".selected-files li").first()).toContainText("second.pdf");
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.getByText(/Uploading files/)).toBeVisible();
  await expect.poll(() => request).toBeDefined();
  const body = multipart(request!);
  expect(body.indexOf('filename="second.pdf"')).toBeLessThan(body.indexOf('filename="first.pdf"'));
  gate.release();
  await expect(page.getByText("merged-6.pdf", { exact: true })).toBeVisible();
  await expectDownload(page, "merged-6.pdf");
});

test("batch conversion sends the shared target format and downloads ZIP", async ({ page }) => {
  const gate = pending();
  let request: Request | undefined;
  await page.route("**/files/convert/batch", async route => {
    request = route.request();
    await gate.wait;
    await route.fulfill({ json: { message: "Batch complete", zip: "batch-7.zip" } });
  });
  await mockDownload(page);
  await page.goto("/tools/batch-convert");
  await page.getByLabel("Choose files").setInputFiles([inputFile("pdf"), inputFile("docx")]);
  await expect(page.locator(".selected-files li")).toHaveCount(2);
  await page.getByLabel("Output format").selectOption("xlsx");
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.getByText(/Uploading files/)).toBeVisible();
  await expect.poll(() => request).toBeDefined();
  const body = multipart(request!);
  expect(body).toContain('name="files"; filename="mixed-content.pdf"');
  expect(body).toContain('name="files"; filename="operations-report.docx"');
  expect(body).toMatch(/name="format"\r\n\r\nxlsx/);
  gate.release();
  await expect(page.getByText("batch-7.zip", { exact: true })).toBeVisible();
  await expectDownload(page, "batch-7.zip");
});

test("PDF unlock submits password and downloads an unlocked PDF", async ({ page }) => {
  const gate = pending();
  let request: Request | undefined;
  await page.route("**/files/pdf/unlock", async route => {
    request = route.request();
    await gate.wait;
    await route.fulfill({ json: { message: "Unlocked", unlocked: "unlocked-8.pdf" } });
  });
  await mockDownload(page);
  await page.goto("/tools/pdf-unlock");
  await page.getByLabel("Choose files").setInputFiles(inputFile("pdf"));
  await page.getByLabel("PDF password").fill("correct-password");
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.getByText(/Uploading files/)).toBeVisible();
  await expect.poll(() => request).toBeDefined();
  expect(multipart(request!)).toMatch(/name="password"\r\n\r\ncorrect-password/);
  gate.release();
  await expect(page.getByText("unlocked-8.pdf", { exact: true })).toBeVisible();
  await expectDownload(page, "unlocked-8.pdf");
});

test("local OCR accepts a language and uses attachment filename", async ({ page }) => {
  const gate = pending();
  let request: Request | undefined;
  await page.route("**/files/ocr/to-word", async route => {
    request = route.request();
    await gate.wait;
    await route.fulfill({ status: 200, body: Buffer.from("docx"), headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="ocr-9.docx"',
    } });
  });
  await page.goto("/tools/ocr-to-word");
  await page.getByLabel("Choose files").setInputFiles(inputFile("png"));
  await page.getByLabel("OCR language code").fill("fra");
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.getByText(/Uploading files/)).toBeVisible();
  await expect.poll(() => request).toBeDefined();
  expect(multipart(request!)).toMatch(/name="lang"\r\n\r\nfra/);
  gate.release();
  await expect(page.getByText("ocr-9.docx", { exact: true })).toBeVisible();
  await expectDownload(page, "ocr-9.docx");
});

test("shows processing after the multipart upload reaches the server", async ({ page }) => {
  const gate = pending();
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the upload before delaying processing. */ }
    await gate.wait;
    response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    response.end(JSON.stringify({ message: "Compressed", compressed: "server-processed.pdf" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await page.route("**/files/pdf/compress", route =>
      route.continue({ url: `http://127.0.0.1:${port}/files/pdf/compress` }));
    await page.goto("/tools/pdf-compress");
    await page.getByLabel("Choose files").setInputFiles(inputFile("pdf"));
    await page.getByRole("button", { name: "Process files" }).click();
    await expect(page.getByText(/Processing your files/)).toBeVisible();
    gate.release();
    await expect(page.getByText("server-processed.pdf", { exact: true })).toBeVisible();
  } finally {
    gate.release();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

for (const [status, message] of [
  [400, "Check the selected file"],
  [413, "This file is too large"],
  [429, "Too many requests"],
  [503, "Processing is temporarily unavailable"],
  [500, "Something went wrong"],
] as const) {
  test(`shows a friendly ${status} backend error`, async ({ page }) => {
    await page.route("**/files/compress", route => route.fulfill({ status, json: { error: "Backend detail" } }));
    await page.goto("/tools/image-compress");
    await page.getByLabel("Choose files").setInputFiles(inputFile("png"));
    await page.getByRole("button", { name: "Process files" }).click();
    await expect(page.locator(".status [role=alert]")).toContainText(message);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
}

test("network failure offers retry, then reset clears success", async ({ page }) => {
  let attempts = 0;
  await page.route("**/files/compress", async route => {
    attempts += 1;
    if (attempts === 1) await route.abort("failed");
    else await route.fulfill({ json: { message: "Compressed", compressed: "retry.png" } });
  });
  await page.goto("/tools/image-compress");
  await page.getByLabel("Choose files").setInputFiles(inputFile("png"));
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.locator(".status [role=alert]")).toContainText("Could not connect");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("retry.png", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator(".selected-files li")).toHaveCount(0);
  await expect(page.getByText("retry.png", { exact: true })).toHaveCount(0);
});
