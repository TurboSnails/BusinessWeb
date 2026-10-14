import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergePath, knownCliDirs, parseShellPath, ensureCliPath, resetCliPath } from "./path.mjs";

test("mergePath keeps order, drops empty entries and duplicates", () => {
  assert.equal(
    mergePath("/usr/bin:/bin", ["/opt/a", "/usr/bin", "", "/opt/b"], ["/opt/a"]),
    "/usr/bin:/bin:/opt/a:/opt/b",
  );
});

test("knownCliDirs expands every installed nvm node version and only existing dirs", async () => {
  const home = await mkdtemp(join(tmpdir(), "vb-home-"));
  try {
    await mkdir(join(home, ".nvm/versions/node/v24.12.0/bin"), { recursive: true });
    await mkdir(join(home, ".nvm/versions/node/v20.1.0/bin"), { recursive: true });
    await mkdir(join(home, ".local/bin"), { recursive: true });
    const dirs = await knownCliDirs(home);
    assert.ok(dirs.includes(join(home, ".nvm/versions/node/v24.12.0/bin")));
    assert.ok(dirs.includes(join(home, ".nvm/versions/node/v20.1.0/bin")));
    assert.ok(dirs.includes(join(home, ".local/bin")));
    assert.ok(!dirs.includes(join(home, ".opencode/bin")));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("parseShellPath reads only the marked PATH and ignores shell noise", () => {
  const out = "Welcome!\nnvm is loading\n__VB_PATH__/a/bin:/b/bin__VB_END__\ntrailing";
  assert.equal(parseShellPath(out), "/a/bin:/b/bin");
  assert.equal(parseShellPath("no marker"), "");
});

test("ensureCliPath extends process.env.PATH once and keeps the original entries first", async () => {
  const original = process.env.PATH;
  process.env.PATH = "/usr/bin:/bin";
  resetCliPath();
  try {
    const first = await ensureCliPath({ home: "/nonexistent-home", shell: null });
    assert.ok(first.startsWith("/usr/bin:/bin"));
    assert.equal(process.env.PATH, first);
    assert.equal(await ensureCliPath({ home: "/nonexistent-home", shell: null }), first);
  } finally {
    process.env.PATH = original;
  }
});
