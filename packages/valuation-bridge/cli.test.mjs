import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDir = fileURLToPath(new URL(".", import.meta.url));
let isolatedDir;
let cliPath;

test.before(async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: packageDir });
  isolatedDir = await mkdtemp(join(tmpdir(), "valuation-bridge-test-"));
  await cp(join(packageDir, "dist"), join(isolatedDir, "dist"), { recursive: true });
  cliPath = join(isolatedDir, "dist", "cli.mjs");
});

test.after(async () => {
  if (isolatedDir) await rm(isolatedDir, { recursive: true, force: true });
});

function launch(port) {
  return spawn(process.execPath, [cliPath, "serve"], {
    cwd: isolatedDir,
    env: { ...process.env, VALUATION_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function capture(child) {
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return {
    output: () => output,
    exit: () => new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code));
    }),
  };
}

async function waitForAddress(child, output) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const match = output().match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) return Number(match[1]);
    if (child.exitCode !== null) throw new Error(`bridge exited: ${output()}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`bridge did not start: ${output()}`);
}

async function occupiedServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

test("standalone serve reports valuation health on a random loopback port", async () => {
  const child = launch(0);
  const result = capture(child);
  try {
    const port = await waitForAddress(child, result.output);
    const response = await fetch(`http://127.0.0.1:${port}/api/valuation/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "valuation");
    assert.equal(body.version, 2);
    assert.ok(Array.isArray(body.features));
    assert.equal(typeof body.token, "string");
    assert.ok(body.token.length > 0);
    const companies = await fetch(`http://127.0.0.1:${port}/api/valuation/companies?q=AAPL`);
    assert.equal(companies.status, 200);
    assert.ok((await companies.json()).some((item) => item.code === "AAPL"));
  } finally {
    child.kill("SIGTERM");
    await result.exit();
  }
});

test("packaged bin runs directly without invoking node explicitly", async () => {
  const child = spawn(cliPath, ["--help"], { cwd: isolatedDir });
  const result = capture(child);
  assert.equal(await result.exit(), 0, result.output());
  assert.match(result.output(), /valuation-bridge/);
});

test("serve stays alive when an existing valuation bridge owns the port", async () => {
  const server = await occupiedServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "valuation", version: 2 }));
  });
  const child = launch(server.address().port);
  const result = capture(child);
  try {
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(child.exitCode, null, result.output());
    assert.match(result.output(), /已在运行/);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await result.exit();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve fails clearly when another program owns the port", async () => {
  const server = await occupiedServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "other" }));
  });
  try {
    const child = launch(server.address().port);
    const result = capture(child);
    assert.equal(await result.exit(), 75);
    assert.match(result.output(), /端口被其他程序占用/);
    assert.match(result.output(), /VALUATION_PORT/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("status asks for reinstall when saved Node or CLI path is missing", async () => {
  const home = await mkdtemp(join(tmpdir(), "valuation-status-test-"));
  try {
    const dir = join(home, ".businessweb-valuation");
    await mkdir(dir);
    await writeFile(join(dir, "install-state.json"), JSON.stringify({ nodePath: join(home, "missing-node"), cliPath: join(dir, "cli.mjs") }));
    const child = spawn(process.execPath, [cliPath, "status"], {
      cwd: isolatedDir,
      env: { ...process.env, HOME: home, VALUATION_PORT: "0" },
    });
    const result = capture(child);
    assert.equal(await result.exit(), 1);
    assert.match(result.output(), /重新运行.*install/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
