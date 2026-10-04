import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const run = (...args) =>
  spawnSync(process.execPath, ["scripts/valuation-cli.mjs", ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
test("prints usage without arguments", () => {
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /用法/);
});
test("rejects unknown flags and unavailable CLI with exit code 1", () => {
  assert.equal(run("--bogus").status, 1);
  const r = run("AAPL", "--cli", "nope");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /不可用/);
});
