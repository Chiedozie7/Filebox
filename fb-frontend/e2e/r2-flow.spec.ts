import { expect, test, type Request } from "@playwright/test";
import { inputFile } from "./fixtures";

test.skip(process.env.FILEBOX_E2E_MODE !== "r2", "R2 mode only");

test("R2 merge uploads in order, sends signed references, and downloads named output", async ({ page }) => {
  const issued: Array<{ name: string; size: number; type: string }> = [];
  const puts: Request[] = [];
  let processRequest: Request | undefined;
  let releaseUpload!: () => void;
  const firstUpload = new Promise<void>(resolve => { releaseUpload = resolve; });
  let releaseProcess!: () => void;
  const processing = new Promise<void>(resolve => { releaseProcess = resolve; });

  await page.route("**/files/r2/upload-url", async route => {
    const input = route.request().postDataJSON() as { name: string; size: number; type: string };
    const index = issued.push(input);
    if (index === 1) await firstUpload;
    await route.fulfill({ json: {
      url: `http://127.0.0.1:3217/r2-put/${index}`,
      method: "PUT",
      headers: { "Content-Type": input.type },
      object: { token: `signed-input-${index}`, key: `temp/input/${index}.pdf`,
        name: input.name, size: input.size, type: input.type, expiresAt: Date.now() + 60_000 },
    } });
  });
  await page.route("**/r2-put/*", async route => {
    puts.push(route.request());
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/files/pdf/merge", async route => {
    processRequest = route.request();
    await processing;
    await route.fulfill({ json: {
      message: "Merged", merged: "server-name.pdf",
      output: { token: "signed-output", key: "temp/output/1.pdf", name: "merged-r2.pdf",
        size: 9, type: "application/pdf", expiresAt: Date.now() + 60_000 },
      downloadUrl: "http://127.0.0.1:3217/r2-download/merged-r2.pdf",
    } });
  });
  await page.route("**/r2-download/*", route => route.fulfill({
    status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.4\n%%EOF"),
  }));

  await page.goto("/tools/pdf-merge");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Choose files").setInputFiles([
    inputFile("pdf", "first.pdf"), inputFile("pdf", "second.pdf"),
  ]);
  await expect(page.locator(".selected-files li")).toHaveCount(2);
  await page.getByRole("button", { name: "Move second.pdf up" }).click();
  await page.getByRole("button", { name: "Process files" }).click();
  await expect(page.getByText(/Uploading files/)).toBeVisible();
  releaseUpload();
  await expect(page.getByText(/Processing your files/)).toBeVisible();
  expect(issued.map(item => item.name)).toEqual(["second.pdf", "first.pdf"]);
  expect(puts).toHaveLength(2);
  expect(puts.map(request => request.headers()["content-type"])).toEqual([
    "application/pdf", "application/pdf",
  ]);
  expect(puts.map(request => request.postDataBuffer()?.length)).toEqual(issued.map(item => item.size));
  expect(processRequest?.postDataJSON()).toMatchObject({
    files: [{ token: "signed-input-1", name: "second.pdf" }, { token: "signed-input-2", name: "first.pdf" }],
  });
  releaseProcess();
  await expect(page.getByText("merged-r2.pdf", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download merged-r2.pdf" }).click();
  expect((await downloaded).suggestedFilename()).toBe("merged-r2.pdf");
});
