import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const modes = process.argv.slice(2);
if (modes.some(mode => !["local", "r2"].includes(mode))) {
  throw new Error("Use local or r2 as the optional E2E mode.");
}
for (const mode of modes.length ? modes : ["local", "r2"]) {
  const result = spawnSync(process.execPath, [cli, "test"], {
    stdio: "inherit",
    env: { ...process.env, FILEBOX_E2E_MODE: mode },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
