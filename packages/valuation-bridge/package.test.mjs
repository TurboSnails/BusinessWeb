import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDir = fileURLToPath(new URL(".", import.meta.url));

test("publish builds the standalone CLI and npm pack includes it", async () => {
  const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.prepublishOnly, "node build.mjs");
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: packageDir });
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: packageDir });
  const files = JSON.parse(stdout)[0].files.map((file) => file.path);
  assert.ok(files.includes("dist/cli.mjs"), files.join(", "));
});
