import { expect, test } from "@playwright/test";
import { inputFile } from "./fixtures";

test("homepage search understands common phrases and opens a tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every file has a next step/ })).toBeVisible();
  const search = page.getByRole("search").first().getByRole("searchbox");
  await search.fill("make image smaller");
  await page.getByRole("button", { name: /Compress image/ }).first().click();
  await expect(page).toHaveURL(/\/tools\/image-compress$/);
  await expect(page.getByRole("heading", { name: "Compress image", exact: true })).toBeVisible();
});

test("discovery routes distinguish multi-file outcomes", async ({ page }) => {
  await page.goto("/workflows/multi-file");
  await expect(page.getByRole("heading", { name: "One batch. The right outcome." })).toBeVisible();
  await expect(page.getByText(/Batch conversion returns a ZIP/)).toBeVisible();
  await page.getByRole("link", { name: /Merge to PDF/ }).click();
  await expect(page).toHaveURL(/\/tools\/pdf-merge$/);
  await expect(page.getByText(/Combine PDFs, Word documents, Excel files, and supported images/)).toBeVisible();
});

test("desktop mega-menu supports keyboard tool search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.locator("#tools-mega-menu")).toBeVisible();
  const search = page.locator("#mega-search input");
  await expect(search).toBeFocused();
  await search.fill("scan to word");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/tools\/ocr-to-word$/);
});

test("mobile navigation offers searchable, collapsible tool groups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Merge to PDF" }).click();
  await expect(page).toHaveURL(/\/tools\/pdf-merge$/);
  await expect(page.locator(".mobile-sheet")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("shared dropzone opens the picker and shows a selected file", async ({ page }) => {
  await page.goto("/tools/image-compress");
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".drop-zone").click();
  await (await chooser).setFiles(inputFile("png"));
  await expect(page.locator(".selected-files li")).toContainText("transparent.png");
});

test("mobile showcases stack visual before actions with uniform PDF cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".capability-strip,.hero-bottom")).toHaveCount(0);
  const layout = await page.evaluate(() => {
    const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
    const bottom = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().bottom;
    const cardHeights = Array.from(document.querySelectorAll(".pdf-actions .action-card"))
      .map(card => Math.round(card.getBoundingClientRect().height));
    const positions = [
        [".pdf-showcase .section-heading", ".pdf-showcase .pdf-feature-visual", ".pdf-showcase .pdf-actions"],
        [".image-showcase .section-heading", ".image-showcase .image-visual", ".image-showcase .showcase-actions"],
        [".office-showcase .section-heading", ".office-showcase .office-visual", ".office-showcase .office-links"],
        [".ocr-showcase .section-heading", ".ocr-showcase .scans-visual", ".ocr-showcase .ocr-details"],
        [".multi-showcase .section-heading", ".multi-showcase .multi-visual", ".multi-showcase .mini-actions"],
      ].map(([heading, visual, actions]) => ({ section: heading, headingBottom: bottom(heading), visualTop: top(visual),
        visualBottom: bottom(visual), actionsTop: top(actions) }));
    return {
      positions,
      cardHeights, scrollWidth: document.documentElement.scrollWidth,
    };
  });
  for (const position of layout.positions) {
    expect(position.headingBottom, position.section).toBeLessThan(position.visualTop);
    expect(position.visualBottom, position.section).toBeLessThanOrEqual(position.actionsTop);
  }
  expect(new Set(layout.cardHeights).size).toBe(1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(390);
});
