import { defineConfig } from "@playwright/test";

const mode = process.env.FILEBOX_E2E_MODE === "r2" ? "r2" : "local";
const origin = "http://127.0.0.1:3217";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: "playwright-results",
  use: { baseURL: origin, browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3217",
    url: `${origin}/file.svg`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    env: {
      NEXT_PUBLIC_FILEBOX_API_URL: origin,
      NEXT_PUBLIC_FILE_STORAGE_MODE: mode,
    },
  },
});
